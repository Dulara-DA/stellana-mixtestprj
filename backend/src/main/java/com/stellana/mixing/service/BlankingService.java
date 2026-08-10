package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.EnumSet;
import java.util.List;
import java.math.BigDecimal;
import java.math.RoundingMode;

import static com.stellana.mixing.api.ApiMapper.blankingBatch;
import static com.stellana.mixing.api.ApiMapper.blankingCart;

@Service
@RequiredArgsConstructor
public class BlankingService {
    private final ApprovedMaterialBatchRepository approvedMaterialBatchRepository;
    private final BlankingBatchRepository blankingBatchRepository;
    private final BlankingCartRepository blankingCartRepository;
    private final PressRepository pressRepository;
    private final CartTransferRepository cartTransferRepository;
    private final MaterialShortageRequestRepository shortageRequestRepository;
    private final CurrentUserService currentUserService;
    private final ShiftService shiftService;
    private final AuditService auditService;
    private final RealtimeEventService realtimeEventService;
    private final InventoryLedgerService inventoryLedgerService;

    @Transactional(readOnly = true)
    public List<BlankingBatchView> listBatches() {
        return blankingBatchRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::blankingBatch)
                .toList();
    }

    @Transactional
    public BlankingBatchView createBatch(CreateBlankingBatchRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        if (blankingBatchRepository.existsByBatchNumberIgnoreCase(request.batchNumber())) {
            throw new BusinessRuleException("Blanking batch number already exists.");
        }
        ApprovedMaterialBatch approved = null;
        String mixingBatchNumber;
        String materialCode;
        if (request.approvedMaterialBatchId() != null) {
            approved = approvedMaterialBatchRepository.findByIdForUpdate(request.approvedMaterialBatchId())
                    .orElseThrow(() -> new NotFoundException("Approved material batch not found."));
            boolean laboratoryPassed = approved.getLabStatus() == LabDecision.PASS;
            ProductionBatch mixingBatch = approved.getMixingBatch();
            boolean laboratoryReleaseApproved = laboratoryPassed && (mixingBatch == null
                    || (mixingBatch.getStatus() == BatchStatus.RELEASED_TO_BLANKING
                    && mixingBatch.getReleaseStatus() == ReleaseStatus.APPROVED_FOR_BLANKING));
            boolean temporaryLabBypass = mixingBatch != null
                    && Boolean.TRUE.equals(mixingBatch.getTemporaryLabBypass())
                    && mixingBatch.getLaboratoryStatus() == LabDecision.PENDING
                    && mixingBatch.getStatus() == BatchStatus.RELEASED_TO_BLANKING
                    && mixingBatch.getReleaseStatus() == ReleaseStatus.APPROVED_FOR_BLANKING;
            if (!approved.isActive() || (!laboratoryReleaseApproved && !temporaryLabBypass)) {
                throw new BusinessRuleException(
                        "Compound stock must pass laboratory, be physically received, and be released before Blanking use.");
            }
            CompoundStockStatus stockStatus = approved.getStockStatus() == null
                    ? CompoundStockStatus.AVAILABLE : approved.getStockStatus();
            if (EnumSet.of(CompoundStockStatus.AWAITING_RECEIPT, CompoundStockStatus.ON_HOLD,
                    CompoundStockStatus.REJECTED, CompoundStockStatus.DEPLETED).contains(stockStatus)) {
                throw new BusinessRuleException("The selected compound stock is not available for Blanking.");
            }
            if (approved.getAvailableQuantityKg().compareTo(request.materialConsumedKg()) < 0) {
                throw new BusinessRuleException("Material consumption exceeds the approved batch quantity available.");
            }
            mixingBatchNumber = approved.getMixingBatchNumber();
            materialCode = approved.getMaterialCode();
        } else {
            if (!StringUtils.hasText(request.mixingBatchNumber())
                    || !StringUtils.hasText(request.materialCode())) {
                throw new BusinessRuleException(
                        "Mixing batch number and compound/material code are required for temporary manual entry.");
            }
            mixingBatchNumber = request.mixingBatchNumber().trim().toUpperCase();
            materialCode = request.materialCode().trim().toUpperCase();
        }

        ShiftService.ShiftContext shift = shiftService.current();
        boolean startImmediately = Boolean.TRUE.equals(request.startImmediately());
        int plannedQuantity = request.plannedProductionQuantity() == null
                ? 0 : request.plannedProductionQuantity();
        BigDecimal averageWeight = request.averageBlankWeightGrams();
        BigDecimal expected = averageWeight == null
                ? null
                : request.materialConsumedKg().multiply(BigDecimal.valueOf(1000))
                        .divide(averageWeight, 6, RoundingMode.HALF_UP);
        Integer expectedWhole = expected == null
                ? null : expected.setScale(0, RoundingMode.DOWN).intValueExact();
        if (approved != null) {
            approved.setAvailableQuantityKg(approved.getAvailableQuantityKg().subtract(request.materialConsumedKg()));
            approved.setReservedQuantityKg(zero(approved.getReservedQuantityKg()).add(request.materialConsumedKg()));
            approved.setStockStatus(approved.getAvailableQuantityKg().signum() == 0
                    ? CompoundStockStatus.DEPLETED : CompoundStockStatus.PARTIALLY_USED);
            approvedMaterialBatchRepository.save(approved);
        }

        BlankingBatch saved = blankingBatchRepository.save(BlankingBatch.builder()
                .batchNumber(request.batchNumber().trim().toUpperCase())
                .approvedMaterialBatch(approved)
                .mixingBatchNumber(mixingBatchNumber)
                .materialCode(materialCode)
                .itemCode(trimToNull(request.itemCode()))
                .millOperator(trimToNull(request.millOperator()))
                .preformerOperator(trimToNull(request.preformerOperator()))
                .materialConsumedKg(request.materialConsumedKg())
                .plannedProductionQuantity(plannedQuantity)
                .averageBlankWeightGrams(averageWeight)
                .expectedBlankQuantity(expected)
                .expectedWholeBlankQuantity(expectedWhole)
                .productionDate(shift.productionDate())
                .shift(shift.shift())
                .startTime(startImmediately ? shift.serverTime() : null)
                .operator(actor)
                .operatorEmployeeId(employeeId(actor))
                .notes(trimToNull(request.notes()))
                .status(startImmediately ? BlankingBatchStatus.IN_PROGRESS : BlankingBatchStatus.PLANNED)
                .build());
        inventoryLedgerService.record(
                InventoryTransactionType.COMPOUND_RESERVED,
                ProductionSection.BLANKING,
                ProductionSection.BLANKING,
                approved == null ? "ManualMixingBatch" : "ApprovedMaterialBatch",
                approved == null ? null : approved.getId(),
                "BlankingBatch",
                saved.getId(),
                request.materialConsumedKg(),
                "kg",
                request.materialConsumedKg(),
                actor,
                (approved == null ? "Temporary manual compound issue to " : "Compound issued to ")
                        + saved.getBatchNumber());
        auditService.record(actor, "CREATE_BLANKING_BATCH", "BlankingBatch", saved.getId(), null,
                saved.getBatchNumber() + " / " + saved.getMixingBatchNumber(),
                approved == null || approved.getMixingBatch() == null
                        ? null : approved.getMixingBatch().getId(), null);
        realtimeEventService.productionChanged("BLANKING", "BLANKING_BATCH_CREATED", saved.getId(),
                saved.getBatchNumber() + " created");
        return blankingBatch(saved);
    }

    @Transactional
    public BlankingBatchView startBatch(Long id) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankingBatch value = requireBatch(id);
        if (value.getStatus() != BlankingBatchStatus.PLANNED) {
            throw new BusinessRuleException("Only a planned Blanking batch can be started.");
        }
        value.setStatus(BlankingBatchStatus.IN_PROGRESS);
        value.setStartTime(shiftService.now());
        value.setOperator(actor);
        value.setOperatorEmployeeId(employeeId(actor));
        BlankingBatch saved = blankingBatchRepository.save(value);
        auditService.record(actor, "START_BLANKING_BATCH", "BlankingBatch", saved.getId(),
                BlankingBatchStatus.PLANNED.name(), BlankingBatchStatus.IN_PROGRESS.name(), null, null);
        realtimeEventService.productionChanged("BLANKING", "BLANKING_BATCH_STARTED", saved.getId(),
                saved.getBatchNumber() + " started");
        return blankingBatch(saved);
    }

    @Transactional
    public BlankingBatchView completeBatch(Long id, CompleteBlankingBatchRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankingBatch value = blankingBatchRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("Blanking batch not found."));
        if (value.getStatus() != BlankingBatchStatus.IN_PROGRESS) {
            throw new BusinessRuleException("Only an in-progress Blanking batch can be completed.");
        }
        int goodQuantity = request.actualGoodBlankQuantity() == null
                ? request.productionQuantity() - request.rejectedQuantity()
                : request.actualGoodBlankQuantity();
        if (goodQuantity < 0 || Math.addExact(goodQuantity, request.rejectedQuantity()) != request.productionQuantity()) {
            throw new BusinessRuleException(
                    "Total production must equal actual good blanks plus rejected blank quantity.");
        }
        BigDecimal averageWeight = value.getAverageBlankWeightGrams();
        BigDecimal rejectedWeightKg = request.rejectedMaterialWeightKg() == null
                ? BigDecimal.ZERO : request.rejectedMaterialWeightKg();
        boolean hasAverageWeight = averageWeight != null && averageWeight.signum() > 0;
        BigDecimal usedWeightKg;
        BigDecimal calculatedRemaining;
        if (hasAverageWeight) {
            usedWeightKg = BigDecimal.valueOf(goodQuantity).multiply(averageWeight)
                    .divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);
            calculatedRemaining = value.getMaterialConsumedKg()
                    .subtract(usedWeightKg)
                    .subtract(rejectedWeightKg)
                    .setScale(3, RoundingMode.HALF_UP);
        } else {
            BigDecimal reportedRemaining = request.measuredRemainingCompoundWeightKg() == null
                    ? BigDecimal.ZERO : request.measuredRemainingCompoundWeightKg().setScale(3, RoundingMode.HALF_UP);
            usedWeightKg = value.getMaterialConsumedKg()
                    .subtract(rejectedWeightKg)
                    .subtract(reportedRemaining)
                    .setScale(3, RoundingMode.HALF_UP);
            calculatedRemaining = reportedRemaining;
        }
        if (calculatedRemaining.signum() < 0) {
            throw new BusinessRuleException(
                    "Used compound and rejected material exceed the compound quantity issued.");
        }
        BigDecimal measuredRemaining = request.measuredRemainingCompoundWeightKg() == null
                ? calculatedRemaining : request.measuredRemainingCompoundWeightKg().setScale(3, RoundingMode.HALF_UP);
        boolean unbalanced = measuredRemaining.subtract(calculatedRemaining).abs()
                .compareTo(new BigDecimal("0.001")) > 0;
        if (unbalanced && (!Boolean.TRUE.equals(request.supervisorConfirmation())
                || !isSupervisor(actor) || !StringUtils.hasText(request.balanceConfirmationReason()))) {
            throw new BusinessRuleException(
                    "The measured remaining compound does not balance. A Blanking Supervisor, Manager, or "
                            + "System Administrator must confirm it with a reason.");
        }
        ApprovedMaterialBatch stock = null;
        if (value.getApprovedMaterialBatch() != null) {
            stock = approvedMaterialBatchRepository
                    .findByIdForUpdate(value.getApprovedMaterialBatch().getId())
                    .orElseThrow(() -> new NotFoundException("Compound stock record not found."));
            if (zero(stock.getReservedQuantityKg()).compareTo(value.getMaterialConsumedKg()) < 0) {
                throw new BusinessRuleException(
                        "Compound reservation is lower than this batch issue. Reconcile stock first.");
            }
            stock.setReservedQuantityKg(zero(stock.getReservedQuantityKg()).subtract(value.getMaterialConsumedKg()));
            stock.setConsumedQuantityKg(zero(stock.getConsumedQuantityKg()).add(usedWeightKg).add(rejectedWeightKg));
            stock.setReturnedQuantityKg(zero(stock.getReturnedQuantityKg()).add(measuredRemaining));
            stock.setAvailableQuantityKg(stock.getAvailableQuantityKg().add(measuredRemaining));
            stock.setStockStatus(stock.getAvailableQuantityKg().signum() == 0
                    ? CompoundStockStatus.DEPLETED : CompoundStockStatus.PARTIALLY_USED);
            approvedMaterialBatchRepository.save(stock);
        }
        String stockReferenceType = stock == null ? "ManualMixingBatch" : "ApprovedMaterialBatch";
        Long stockReferenceId = stock == null ? null : stock.getId();

        value.setProductionQuantity(request.productionQuantity());
        value.setActualGoodBlankQuantity(goodQuantity);
        value.setRejectedQuantity(request.rejectedQuantity());
        value.setRejectedMaterialWeightKg(rejectedWeightKg);
        value.setActualUsedCompoundWeightKg(usedWeightKg);
        value.setRemainingCompoundWeightKg(measuredRemaining);
        value.setProductionVariance(value.getExpectedWholeBlankQuantity() == null
                ? 0 : goodQuantity - value.getExpectedWholeBlankQuantity());
        value.setUnbalanced(unbalanced);
        value.setBalanceConfirmationReason(unbalanced ? request.balanceConfirmationReason().trim() : null);
        value.setBalanceConfirmedBy(unbalanced ? actor : null);
        value.setAvailableGoodBlankQuantity(goodQuantity);
        value.setEndTime(shiftService.now());
        value.setStatus(BlankingBatchStatus.READY);
        if (StringUtils.hasText(request.notes())) {
            value.setNotes(request.notes().trim());
        }
        BlankingBatch saved = blankingBatchRepository.save(value);
        inventoryLedgerService.record(
                InventoryTransactionType.COMPOUND_CONSUMED,
                ProductionSection.BLANKING,
                ProductionSection.BLANKING,
                "BlankingBatch",
                saved.getId(),
                stockReferenceType,
                stockReferenceId,
                usedWeightKg.add(rejectedWeightKg),
                "kg",
                usedWeightKg.add(rejectedWeightKg),
                actor,
                "Blanking completion; rejected material " + rejectedWeightKg + " kg");
        if (measuredRemaining.signum() > 0) {
            inventoryLedgerService.record(
                    InventoryTransactionType.COMPOUND_RETURNED,
                    ProductionSection.BLANKING,
                    ProductionSection.BLANKING,
                    "BlankingBatch",
                    saved.getId(),
                    stockReferenceType,
                    stockReferenceId,
                    measuredRemaining,
                    "kg",
                    measuredRemaining,
                    actor,
                    "Unused compound returned after Blanking");
        }
        inventoryLedgerService.record(
                InventoryTransactionType.BLANKS_PRODUCED,
                ProductionSection.BLANKING,
                ProductionSection.BLANKING,
                "BlankingBatch",
                saved.getId(),
                "BlankingBatch",
                saved.getId(),
                BigDecimal.valueOf(goodQuantity),
                "pieces",
                usedWeightKg,
                actor,
                "Good blanks produced");
        auditService.record(actor, "COMPLETE_BLANKING_BATCH", "BlankingBatch", saved.getId(),
                "IN_PROGRESS", "READY / good " + goodQuantity + " / rejected " + request.rejectedQuantity(),
                null, null);
        realtimeEventService.productionChanged("BLANKING", "BLANKING_BATCH_COMPLETED", saved.getId(),
                saved.getBatchNumber() + " completed with " + goodQuantity + " good blanks");
        return blankingBatch(saved);
    }

    @Transactional
    public BlankingBatchView correctBatch(Long id, CorrectBlankingBatchRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankingBatch value = blankingBatchRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("Blanking batch not found."));
        if (value.getStatus() != BlankingBatchStatus.READY) {
            throw new BusinessRuleException(
                    "Only a completed Blanking batch that has not entered cart dispatch can be corrected.");
        }
        if (!blankingCartRepository.findAllByBlankingBatchIdOrderByCreatedAtAsc(id).isEmpty()) {
            throw new BusinessRuleException(
                    "This batch already has carts. Correct it through a supervised inventory reconciliation.");
        }

        BigDecimal averageWeight = value.getAverageBlankWeightGrams();
        if (averageWeight == null || averageWeight.signum() <= 0) {
            throw new BusinessRuleException("Average blank weight is required for this correction.");
        }
        int totalProduction = Math.addExact(
                request.actualGoodBlankQuantity(), request.rejectedQuantity());
        BigDecimal usedWeight = BigDecimal.valueOf(request.actualGoodBlankQuantity())
                .multiply(averageWeight)
                .divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);
        BigDecimal rejectedWeight = request.rejectedMaterialWeightKg().setScale(3, RoundingMode.HALF_UP);
        BigDecimal calculatedRemaining = value.getMaterialConsumedKg()
                .subtract(usedWeight)
                .subtract(rejectedWeight)
                .setScale(3, RoundingMode.HALF_UP);
        if (calculatedRemaining.signum() < 0) {
            throw new BusinessRuleException(
                    "Corrected used compound and rejected material exceed the issued quantity.");
        }
        BigDecimal measuredRemaining = request.measuredRemainingCompoundWeightKg()
                .setScale(3, RoundingMode.HALF_UP);
        boolean unbalanced = measuredRemaining.subtract(calculatedRemaining).abs()
                .compareTo(new BigDecimal("0.001")) > 0;

        BigDecimal oldConsumed = zero(value.getActualUsedCompoundWeightKg())
                .add(zero(value.getRejectedMaterialWeightKg()));
        BigDecimal newConsumed = usedWeight.add(rejectedWeight);
        ApprovedMaterialBatch stock = null;
        if (value.getApprovedMaterialBatch() != null) {
            stock = approvedMaterialBatchRepository
                    .findByIdForUpdate(value.getApprovedMaterialBatch().getId())
                    .orElseThrow(() -> new NotFoundException("Compound stock record not found."));
            BigDecimal correctedConsumedStock = zero(stock.getConsumedQuantityKg())
                    .subtract(oldConsumed)
                    .add(newConsumed);
            BigDecimal correctedReturnedStock = zero(stock.getReturnedQuantityKg())
                    .subtract(zero(value.getRemainingCompoundWeightKg()))
                    .add(measuredRemaining);
            BigDecimal correctedAvailableStock = zero(stock.getAvailableQuantityKg())
                    .subtract(zero(value.getRemainingCompoundWeightKg()))
                    .add(measuredRemaining);
            if (correctedConsumedStock.signum() < 0 || correctedReturnedStock.signum() < 0
                    || correctedAvailableStock.signum() < 0) {
                throw new BusinessRuleException(
                        "The correction would make Compound Stock negative. Reconcile inventory first.");
            }
            stock.setConsumedQuantityKg(correctedConsumedStock);
            stock.setReturnedQuantityKg(correctedReturnedStock);
            stock.setAvailableQuantityKg(correctedAvailableStock);
            stock.setStockStatus(correctedAvailableStock.signum() == 0
                    ? CompoundStockStatus.DEPLETED : CompoundStockStatus.PARTIALLY_USED);
            approvedMaterialBatchRepository.save(stock);
        }
        String stockReferenceType = stock == null ? "ManualMixingBatch" : "ApprovedMaterialBatch";
        Long stockReferenceId = stock == null ? null : stock.getId();

        String oldValue = "good=" + value.getActualGoodBlankQuantity()
                + ", rejected=" + value.getRejectedQuantity()
                + ", usedKg=" + value.getActualUsedCompoundWeightKg()
                + ", rejectedKg=" + value.getRejectedMaterialWeightKg()
                + ", remainingKg=" + value.getRemainingCompoundWeightKg();
        int oldGood = value.getActualGoodBlankQuantity() == null
                ? 0 : value.getActualGoodBlankQuantity();
        value.setProductionQuantity(totalProduction);
        value.setActualGoodBlankQuantity(request.actualGoodBlankQuantity());
        value.setRejectedQuantity(request.rejectedQuantity());
        value.setRejectedMaterialWeightKg(rejectedWeight);
        value.setActualUsedCompoundWeightKg(usedWeight);
        value.setRemainingCompoundWeightKg(measuredRemaining);
        value.setProductionVariance(request.actualGoodBlankQuantity() - value.getExpectedWholeBlankQuantity());
        value.setAvailableGoodBlankQuantity(request.actualGoodBlankQuantity());
        value.setUnbalanced(unbalanced);
        value.setBalanceConfirmationReason(request.reason().trim());
        value.setBalanceConfirmedBy(actor);
        BlankingBatch saved = blankingBatchRepository.save(value);

        String newValue = "good=" + saved.getActualGoodBlankQuantity()
                + ", rejected=" + saved.getRejectedQuantity()
                + ", usedKg=" + saved.getActualUsedCompoundWeightKg()
                + ", rejectedKg=" + saved.getRejectedMaterialWeightKg()
                + ", remainingKg=" + saved.getRemainingCompoundWeightKg()
                + ", reason=" + request.reason().trim();
        inventoryLedgerService.record(
                InventoryTransactionType.INVENTORY_CORRECTION,
                ProductionSection.BLANKING,
                ProductionSection.BLANKING,
                "BlankingBatch",
                saved.getId(),
                stockReferenceType,
                stockReferenceId,
                BigDecimal.valueOf(request.actualGoodBlankQuantity() - oldGood),
                "pieces",
                newConsumed.subtract(oldConsumed),
                actor,
                request.reason().trim());
        auditService.record(actor, "CORRECT_BLANKING_BATCH", "BlankingBatch", saved.getId(),
                oldValue, newValue,
                stock == null || stock.getMixingBatch() == null
                        ? null : stock.getMixingBatch().getId(), null);
        realtimeEventService.productionChanged("BLANKING", "BLANKING_BATCH_CORRECTED", saved.getId(),
                saved.getBatchNumber() + " corrected by " + actor.getFullName());
        return blankingBatch(saved);
    }

    @Transactional(readOnly = true)
    public List<BlankingCartView> listCarts() {
        return blankingCartRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::blankingCart)
                .toList();
    }

    @Transactional
    public BlankingCartView createCart(CreateBlankingCartRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        if (blankingCartRepository.existsByCartNumberIgnoreCase(request.cartNumber())) {
            throw new BusinessRuleException("Cart number already exists.");
        }
        BlankingBatch batch = blankingBatchRepository.findByIdForUpdate(request.blankingBatchId())
                .orElseThrow(() -> new NotFoundException("Blanking batch not found."));
        if (!EnumSet.of(BlankingBatchStatus.READY, BlankingBatchStatus.PARTIALLY_DISPATCHED)
                .contains(batch.getStatus())) {
            throw new BusinessRuleException("Carts can be prepared only from a ready Blanking batch.");
        }
        if (request.quantity() > batch.getAvailableGoodBlankQuantity()) {
            throw new BusinessRuleException("Cart quantity exceeds the available good blank quantity.");
        }
        Press press = pressRepository.findById(request.destinationPressId())
                .filter(Press::isActive)
                .orElseThrow(() -> new NotFoundException("Destination press not found or inactive."));
        BigDecimal averageBlankWeightGrams = request.averageBlankWeightGrams().setScale(3, RoundingMode.HALF_UP);
        BigDecimal materialWeightKg = averageBlankWeightGrams.multiply(BigDecimal.valueOf(request.quantity()))
                .divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);

        batch.setAvailableGoodBlankQuantity(batch.getAvailableGoodBlankQuantity() - request.quantity());
        blankingBatchRepository.save(batch);
        BlankingCart saved = blankingCartRepository.save(BlankingCart.builder()
                .cartNumber(request.cartNumber().trim().toUpperCase())
                .blankingBatch(batch)
                .materialCode(batch.getMaterialCode())
                .mixingBatchNumber(batch.getMixingBatchNumber())
                .itemCode(batch.getItemCode())
                .quantity(request.quantity())
                .remainingQuantity(request.quantity())
                .returnedQuantity(0)
                .averageBlankWeightGrams(averageBlankWeightGrams)
                .materialWeightKg(materialWeightKg)
                .createdBy(actor)
                .destinationPress(press)
                .status(BlankingCartStatus.PREPARED)
                .blankingNote(trimToNull(request.blankingNote()))
                .build());
        inventoryLedgerService.record(
                InventoryTransactionType.BLANKS_RESERVED_TO_CART,
                ProductionSection.BLANKING,
                ProductionSection.BLANKING,
                "BlankingBatch",
                batch.getId(),
                "BlankingCart",
                saved.getId(),
                BigDecimal.valueOf(saved.getQuantity()),
                "pieces",
                saved.getMaterialWeightKg(),
                actor,
                "Reserved to cart " + saved.getCartNumber());

        if (request.shortageRequestId() != null) {
            MaterialShortageRequest shortage = shortageRequestRepository.findById(request.shortageRequestId())
                    .orElseThrow(() -> new NotFoundException("Shortage request not found."));
            if (shortage.getStatus() == ShortageStatus.FULFILLED
                    || shortage.getStatus() == ShortageStatus.CANCELLED) {
                throw new BusinessRuleException("A closed shortage request cannot be linked to a cart.");
            }
            shortage.setLinkedCart(saved);
            shortage.setStatus(ShortageStatus.PREPARING);
            shortage.addMessage(RequestMessage.builder()
                    .sender(actor)
                    .message("Cart " + saved.getCartNumber() + " prepared for this request.")
                    .statusSnapshot(ShortageStatus.PREPARING)
                    .build());
            shortageRequestRepository.save(shortage);
            realtimeEventService.shortagesChanged("SHORTAGE_CART_LINKED", shortage.getId(),
                    saved.getCartNumber() + " linked to " + shortage.getRequestNumber());
        }

        auditService.record(actor, "PREPARE_BLANKING_CART", "BlankingCart", saved.getId(), null,
                saved.getCartNumber() + " / " + saved.getQuantity() + " blanks / "
                        + saved.getMaterialWeightKg() + " kg / " + saved.getAverageBlankWeightGrams()
                        + " g per blank / " + press.getPressNumber(),
                null, null);
        realtimeEventService.productionChanged("BLANKING", "CART_PREPARED", saved.getId(),
                saved.getCartNumber() + " prepared for " + press.getPressNumber());
        return blankingCart(saved);
    }

    @Transactional
    public BlankingCartView dispatchCart(Long id, DispatchCartRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankingCart cart = blankingCartRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("Blanking cart not found."));
        if (!EnumSet.of(BlankingCartStatus.PREPARED, BlankingCartStatus.READY_FOR_DISPATCH)
                .contains(cart.getStatus())) {
            throw new BusinessRuleException("Only a prepared or ready cart can be dispatched.");
        }
        if (cartTransferRepository.existsByCartId(cart.getId())) {
            throw new BusinessRuleException("This cart already has a dispatch transaction.");
        }
        cart.setStatus(BlankingCartStatus.DISPATCHED);
        cart.setDispatchedAt(shiftService.now());
        cart.setDispatchedBy(actor);
        if (StringUtils.hasText(request.note())) {
            cart.setBlankingNote(appendNote(cart.getBlankingNote(), request.note().trim()));
        }
        BlankingCart saved = blankingCartRepository.save(cart);
        cartTransferRepository.save(CartTransfer.builder()
                .cart(saved)
                .fromSection(ProductionSection.BLANKING)
                .destinationPress(saved.getDestinationPress())
                .quantity(saved.getQuantity())
                .dispatchedBy(actor)
                .dispatchedAt(saved.getDispatchedAt())
                .status(CartTransferStatus.DISPATCHED)
                .build());
        inventoryLedgerService.record(
                InventoryTransactionType.CART_DISPATCHED,
                ProductionSection.BLANKING,
                ProductionSection.MOULDING,
                "BlankingCart",
                saved.getId(),
                "Press",
                saved.getDestinationPress().getId(),
                BigDecimal.valueOf(saved.getQuantity()),
                "pieces",
                saved.getMaterialWeightKg(),
                actor,
                "Dispatched to " + saved.getDestinationPress().getPressNumber());
        updateBatchDispatchStatus(saved.getBlankingBatch());

        shortageRequestRepository.findFirstByLinkedCartId(saved.getId()).ifPresent(shortage -> {
            shortage.setStatus(ShortageStatus.DISPATCHED);
            shortage.addMessage(RequestMessage.builder()
                    .sender(actor)
                    .message("Cart " + saved.getCartNumber() + " dispatched to "
                            + saved.getDestinationPress().getPressNumber() + ".")
                    .statusSnapshot(ShortageStatus.DISPATCHED)
                    .build());
            shortageRequestRepository.save(shortage);
            realtimeEventService.shortagesChanged("SHORTAGE_CART_DISPATCHED", shortage.getId(),
                    saved.getCartNumber() + " dispatched");
        });

        auditService.record(actor, "DISPATCH_BLANKING_CART", "BlankingCart", saved.getId(),
                BlankingCartStatus.PREPARED.name(),
                BlankingCartStatus.DISPATCHED.name() + " / " + saved.getDestinationPress().getPressNumber(),
                null, null);
        realtimeEventService.productionChanged("BLANKING", "CART_DISPATCHED", saved.getId(),
                saved.getCartNumber() + " dispatched to " + saved.getDestinationPress().getPressNumber());
        return blankingCart(saved);
    }

    @Transactional
    public BlankingCartView holdCart(Long id, HoldCartRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankingCart cart = blankingCartRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("Blanking cart not found."));
        if (!EnumSet.of(BlankingCartStatus.PREPARED, BlankingCartStatus.READY_FOR_DISPATCH)
                .contains(cart.getStatus())) {
            throw new BusinessRuleException("Only a prepared or ready cart can be held.");
        }
        BlankingCartStatus previous = cart.getStatus();
        cart.setStatus(BlankingCartStatus.HELD);
        cart.setHeldAt(shiftService.now());
        cart.setHeldBy(actor);
        cart.setHoldReason(request.reason().trim());
        BlankingCart saved = blankingCartRepository.save(cart);
        auditService.record(actor, "HOLD_BLANKING_CART", "BlankingCart", saved.getId(),
                previous.name(), "HELD / " + saved.getHoldReason(), null, null);
        realtimeEventService.productionChanged("BLANKING", "CART_HELD", saved.getId(),
                saved.getCartNumber() + " held");
        return blankingCart(saved);
    }

    @Transactional
    public BlankingCartView releaseCart(Long id, ReleaseCartRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankingCart cart = blankingCartRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("Blanking cart not found."));
        if (cart.getStatus() != BlankingCartStatus.HELD) {
            throw new BusinessRuleException("Only a held cart can be released.");
        }
        cart.setStatus(BlankingCartStatus.READY_FOR_DISPATCH);
        cart.setReleasedAt(shiftService.now());
        cart.setReleasedBy(actor);
        if (request != null && StringUtils.hasText(request.note())) {
            cart.setBlankingNote(appendNote(cart.getBlankingNote(), request.note().trim()));
        }
        BlankingCart saved = blankingCartRepository.save(cart);
        auditService.record(actor, "RELEASE_BLANKING_CART", "BlankingCart", saved.getId(),
                "HELD / " + saved.getHoldReason(), "READY_FOR_DISPATCH", null, null);
        realtimeEventService.productionChanged("BLANKING", "CART_RELEASED", saved.getId(),
                saved.getCartNumber() + " ready for dispatch");
        return blankingCart(saved);
    }

    public BlankingBatch requireBatch(Long id) {
        return blankingBatchRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Blanking batch not found."));
    }

    public BlankingCart requireCart(Long id) {
        return blankingCartRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Blanking cart not found."));
    }

    private void updateBatchDispatchStatus(BlankingBatch batch) {
        List<BlankingCart> carts = blankingCartRepository
                .findAllByBlankingBatchIdOrderByCreatedAtAsc(batch.getId());
        boolean allAllocatedCartsDispatched = carts.stream()
                .noneMatch(cart -> EnumSet.of(BlankingCartStatus.PREPARED, BlankingCartStatus.HELD,
                        BlankingCartStatus.READY_FOR_DISPATCH).contains(cart.getStatus()));
        if (batch.getAvailableGoodBlankQuantity() == 0 && allAllocatedCartsDispatched) {
            batch.setStatus(BlankingBatchStatus.FULLY_DISPATCHED);
        } else {
            batch.setStatus(BlankingBatchStatus.PARTIALLY_DISPATCHED);
        }
        blankingBatchRepository.save(batch);
    }

    private String employeeId(UserAccount user) {
        return StringUtils.hasText(user.getEmployeeId()) ? user.getEmployeeId() : "USER-" + user.getId();
    }

    private String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String appendNote(String current, String next) {
        return StringUtils.hasText(current) ? current + "\n" + next : next;
    }

    private BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private boolean isSupervisor(UserAccount actor) {
        return EnumSet.of(Role.BLANKING_SUPERVISOR, Role.MANAGER, Role.SYSTEM_ADMIN)
                .contains(actor.getRole());
    }
}

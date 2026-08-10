package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.ApprovedMaterialBatchView;
import com.stellana.mixing.api.ApiModels.CompoundStockStatusRequest;
import com.stellana.mixing.api.ApiModels.UpdateCompoundReceiptRequest;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.ApprovedMaterialBatchRepository;
import com.stellana.mixing.repository.LabSampleRepository;
import com.stellana.mixing.repository.ProductionBatchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import static com.stellana.mixing.api.ApiMapper.approvedMaterialBatch;

@Service
@RequiredArgsConstructor
public class ApprovedMaterialService {
    private final ApprovedMaterialBatchRepository approvedMaterialBatchRepository;
    private final LabSampleRepository labSampleRepository;
    private final ProductionBatchRepository productionBatchRepository;
    private final AuditService auditService;
    private final RealtimeEventService realtimeEventService;
    private final ShiftService shiftService;
    private final InventoryLedgerService inventoryLedgerService;
    private final CurrentUserService currentUserService;

    @Transactional(readOnly = true)
    public List<ApprovedMaterialBatchView> list() {
        return approvedMaterialBatchRepository.findAllByOrderByApprovedAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::approvedMaterialBatch)
                .toList();
    }

    @Transactional
    public List<ApprovedMaterialBatchView> synchronizePassedBatches() {
        UserAccount actor = currentUser();
        return productionBatchRepository.findAllByLaboratoryStatusOrderByCreatedAtDesc(LabDecision.PASS).stream()
                .filter(batch -> approvedMaterialBatchRepository
                        .findByMixingBatchNumberIgnoreCase(batch.getBatchNumber()).isEmpty())
                .map(batch -> labSampleRepository.findFirstByBatchIdOrderBySentToLabAtDesc(batch.getId())
                        .filter(sample -> sample.getDecision() == LabDecision.PASS)
                        .map(sample -> createAwaitingReceiptFromLabPass(batch, sample, actor))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
                .map(com.stellana.mixing.api.ApiMapper::approvedMaterialBatch)
                .toList();
    }

    @Transactional
    public ApprovedMaterialBatch createAwaitingReceiptFromLabPass(
            ProductionBatch batch,
            LabSample labApproval,
            UserAccount actor
    ) {
        if (batch.getLaboratoryStatus() != LabDecision.PASS
                || labApproval.getDecision() != LabDecision.PASS) {
            throw new BusinessRuleException("Only a laboratory-passed Mixing batch can await Blanking receipt.");
        }
        return approvedMaterialBatchRepository.findByMixingBatchNumberIgnoreCase(batch.getBatchNumber())
                .orElseGet(() -> {
                    BigDecimal quantity = batch.getActualOutputQuantityKg() == null
                            ? batch.getPlannedQuantityKg()
                            : batch.getActualOutputQuantityKg();
                    ApprovedMaterialBatch saved = approvedMaterialBatchRepository.save(
                            ApprovedMaterialBatch.builder()
                                    .mixingBatch(batch)
                                    .labApproval(labApproval)
                                    .mixingBatchNumber(batch.getBatchNumber())
                                    .materialCode(batch.getRecipeRevision().getRecipe().getRecipeCode())
                                    .compoundName(batch.getRecipeRevision().getRecipe().getCompoundName())
                                    .labStatus(LabDecision.PASS)
                                    .approvedQuantityKg(quantity)
                                    .availableQuantityKg(BigDecimal.ZERO)
                                    .plannedQuantityKg(batch.getPlannedQuantityKg())
                                    .receivedQuantityKg(BigDecimal.ZERO)
                                    .reservedQuantityKg(BigDecimal.ZERO)
                                    .consumedQuantityKg(BigDecimal.ZERO)
                                    .returnedQuantityKg(BigDecimal.ZERO)
                                    .approvedAt(labApproval.getTestDateTime() == null
                                            ? shiftService.now() : labApproval.getTestDateTime())
                                    .stockStatus(CompoundStockStatus.AWAITING_RECEIPT)
                                    .notes("Laboratory PASS recorded. Awaiting physical receipt confirmation in Blanking.")
                                    .active(true)
                                    .build());
                    auditService.record(actor, "QUEUE_PASSED_COMPOUND_FOR_RECEIPT", "ApprovedMaterialBatch",
                            saved.getId(), null,
                            saved.getMixingBatchNumber() + " / awaiting receipt / " + quantity + " kg approved",
                            batch.getId(), batch.getRecipeRevision().getRecipe().getId());
                    realtimeEventService.productionChanged("BLANKING", "COMPOUND_AWAITING_RECEIPT",
                            saved.getId(), saved.getMixingBatchNumber() + " passed laboratory and awaits receipt");
                    return saved;
                });
    }

    @Transactional
    public ApprovedMaterialBatch createFromReleasedMixingBatch(ProductionBatch batch, UserAccount actor) {
        boolean temporaryLabBypass = Boolean.TRUE.equals(batch.getTemporaryLabBypass());
        boolean laboratoryPassed = batch.getLaboratoryStatus() == LabDecision.PASS;
        if ((!laboratoryPassed && !temporaryLabBypass)
                || batch.getReleaseStatus() != ReleaseStatus.APPROVED_FOR_BLANKING) {
            throw new BusinessRuleException(
                    "Only a laboratory-passed or explicitly authorized temporary-release Mixing batch can enter Blanking.");
        }
        if (temporaryLabBypass && (batch.getLaboratoryStatus() != LabDecision.PENDING
                || batch.getTemporaryLabBypassApprovedBy() == null
                || batch.getTemporaryLabBypassApprovedAt() == null
                || batch.getTemporaryLabBypassReason() == null
                || batch.getTemporaryLabBypassReason().isBlank())) {
            throw new BusinessRuleException("The temporary laboratory bypass authorization is incomplete.");
        }
        return approvedMaterialBatchRepository.findByMixingBatchNumberIgnoreCase(batch.getBatchNumber())
                .orElseGet(() -> {
                    LabSample labApproval = laboratoryPassed
                            ? labSampleRepository.findFirstByBatchIdOrderBySentToLabAtDesc(batch.getId())
                                    .filter(sample -> sample.getDecision() == LabDecision.PASS)
                                    .orElse(null)
                            : null;
                    BigDecimal quantity = batch.getActualOutputQuantityKg() == null
                            ? batch.getPlannedQuantityKg()
                            : batch.getActualOutputQuantityKg();
                    ApprovedMaterialBatch saved = approvedMaterialBatchRepository.save(
                            ApprovedMaterialBatch.builder()
                                    .mixingBatch(batch)
                                    .labApproval(labApproval)
                                    .mixingBatchNumber(batch.getBatchNumber())
                                    .materialCode(batch.getRecipeRevision().getRecipe().getRecipeCode())
                                    .compoundName(batch.getRecipeRevision().getRecipe().getCompoundName())
                                    .labStatus(laboratoryPassed ? LabDecision.PASS : LabDecision.PENDING)
                                    .approvedQuantityKg(quantity)
                                    .availableQuantityKg(quantity)
                                    .plannedQuantityKg(batch.getPlannedQuantityKg())
                                    .receivedQuantityKg(quantity)
                                    .reservedQuantityKg(BigDecimal.ZERO)
                                    .consumedQuantityKg(BigDecimal.ZERO)
                                    .returnedQuantityKg(BigDecimal.ZERO)
                                    .approvedAt(temporaryLabBypass
                                            ? batch.getTemporaryLabBypassApprovedAt()
                                            : labApproval != null && labApproval.getTestDateTime() != null
                                                    ? labApproval.getTestDateTime() : shiftService.now())
                                    .receivedAt(shiftService.now())
                                    .receivingOperator(actor)
                                    .stockStatus(CompoundStockStatus.AVAILABLE)
                                    .notes(temporaryLabBypass
                                            ? "TEMPORARY LAB BYPASS — authorized by "
                                                    + batch.getTemporaryLabBypassApprovedBy().getFullName()
                                                    + ". Reason: " + batch.getTemporaryLabBypassReason()
                                                    + ". This is not a laboratory PASS."
                                            : "Automatically created from the passed Mixing/Lab release.")
                                    .active(true)
                                    .build());
                    inventoryLedgerService.record(
                            InventoryTransactionType.COMPOUND_RECEIVED,
                            ProductionSection.MIXING,
                            ProductionSection.BLANKING,
                            "ProductionBatch",
                            batch.getId(),
                            "ApprovedMaterialBatch",
                            saved.getId(),
                            quantity,
                            "kg",
                            quantity,
                            actor,
                            temporaryLabBypass
                                    ? "Temporary authorized release without lab sampling for Blanking"
                                    : "Lab PASS and Manager release for Blanking");
                    auditService.record(actor, temporaryLabBypass
                                    ? "TEMPORARY_MATERIAL_RELEASE_FOR_BLANKING"
                                    : "APPROVE_MATERIAL_FOR_BLANKING", "ApprovedMaterialBatch",
                            saved.getId(), null,
                            saved.getMixingBatchNumber() + " / " + quantity + " kg",
                            batch.getId(), batch.getRecipeRevision().getRecipe().getId());
                    realtimeEventService.productionChanged("BLANKING", temporaryLabBypass
                                    ? "TEMPORARY_MATERIAL_BATCH_RELEASED"
                                    : "MATERIAL_BATCH_APPROVED", saved.getId(),
                            saved.getMixingBatchNumber() + (temporaryLabBypass
                                    ? " is temporarily available to Blanking without lab sampling"
                                    : " is available to Blanking"));
                    return saved;
                });
    }

    public ApprovedMaterialBatchView view(ApprovedMaterialBatch value) {
        return approvedMaterialBatch(value);
    }

    @Transactional
    public ApprovedMaterialBatchView changeStatus(Long id, CompoundStockStatusRequest request) {
        UserAccount actor = currentUser();
        ApprovedMaterialBatch value = approvedMaterialBatchRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("Compound stock record not found."));
        if (request.status() == CompoundStockStatus.AWAITING_RECEIPT
                || request.status() == CompoundStockStatus.DEPLETED) {
            throw new BusinessRuleException(
                    "Awaiting receipt and depleted states are controlled by stock quantities.");
        }
        if (request.status() == CompoundStockStatus.AVAILABLE
                || request.status() == CompoundStockStatus.PARTIALLY_USED) {
            if (value.getAvailableQuantityKg().signum() <= 0) {
                throw new BusinessRuleException("A zero-balance stock record cannot be made available.");
            }
            request = new CompoundStockStatusRequest(
                    value.getAvailableQuantityKg().compareTo(
                            value.getReceivedQuantityKg() == null
                                    ? value.getApprovedQuantityKg() : value.getReceivedQuantityKg()) >= 0
                            ? CompoundStockStatus.AVAILABLE : CompoundStockStatus.PARTIALLY_USED,
                    request.reason());
        }
        CompoundStockStatus previous = value.getStockStatus() == null
                ? CompoundStockStatus.AVAILABLE : value.getStockStatus();
        value.setStockStatus(request.status());
        value.setActive(request.status() != CompoundStockStatus.REJECTED);
        value.setNotes(append(value.getNotes(), "Status " + request.status()
                + ": " + request.reason().trim()));
        ApprovedMaterialBatch saved = approvedMaterialBatchRepository.save(value);
        inventoryLedgerService.record(
                InventoryTransactionType.INVENTORY_CORRECTION,
                ProductionSection.BLANKING,
                ProductionSection.BLANKING,
                "ApprovedMaterialBatch",
                saved.getId(),
                "ApprovedMaterialBatch",
                saved.getId(),
                BigDecimal.ZERO,
                "kg",
                BigDecimal.ZERO,
                actor,
                "Status " + previous + " → " + saved.getStockStatus()
                        + " / " + request.reason().trim());
        auditService.record(actor, "CHANGE_COMPOUND_STOCK_STATUS", "ApprovedMaterialBatch",
                saved.getId(), previous.name(), saved.getStockStatus().name()
                        + " / " + request.reason().trim(),
                saved.getMixingBatch() == null ? null : saved.getMixingBatch().getId(), null);
        realtimeEventService.productionChanged("BLANKING", "COMPOUND_STOCK_STATUS_CHANGED",
                saved.getId(), saved.getMixingBatchNumber() + " is " + saved.getStockStatus());
        return approvedMaterialBatch(saved);
    }

    @Transactional
    public ApprovedMaterialBatchView updateReceipt(Long id, UpdateCompoundReceiptRequest request) {
        UserAccount actor = currentUser();
        ApprovedMaterialBatch value = approvedMaterialBatchRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("Compound stock record not found."));
        BigDecimal previousReceived = amount(value.getReceivedQuantityKg() == null
                ? value.getApprovedQuantityKg() : value.getReceivedQuantityKg());
        BigDecimal previousAvailable = amount(value.getAvailableQuantityKg());
        BigDecimal received = request.receivedQuantityKg().setScale(3, RoundingMode.HALF_UP);
        BigDecimal difference = received.subtract(previousReceived);
        BigDecimal available = previousAvailable.add(difference);
        boolean firstPhysicalReceipt = value.getStockStatus() == CompoundStockStatus.AWAITING_RECEIPT
                && previousReceived.signum() == 0
                && received.signum() > 0;
        BigDecimal allocated = amount(value.getReservedQuantityKg()).add(amount(value.getConsumedQuantityKg()));
        BigDecimal minimumReceived = previousReceived.subtract(previousAvailable)
                .max(allocated)
                .max(BigDecimal.ZERO);
        if (available.signum() < 0 || received.compareTo(minimumReceived) < 0) {
            throw new BusinessRuleException("Received quantity cannot be less than "
                    + minimumReceived.setScale(3, RoundingMode.HALF_UP)
                    + " kg because that quantity is already reserved or consumed.");
        }

        value.setReceivedQuantityKg(received);
        value.setAvailableQuantityKg(available);
        value.setReceivedAt(shiftService.now());
        value.setReceivingOperator(actor);
        value.setStockStatus(statusAfterReceipt(value, received, available));
        value.setActive(value.getStockStatus() != CompoundStockStatus.REJECTED);
        String reason = request.reason().trim();
        value.setNotes(append(value.getNotes(), "Manual receipt update: "
                + previousReceived + " kg → " + received + " kg. Reason: " + reason));
        ApprovedMaterialBatch saved = approvedMaterialBatchRepository.save(value);

        inventoryLedgerService.record(
                firstPhysicalReceipt
                        ? InventoryTransactionType.COMPOUND_RECEIVED
                        : InventoryTransactionType.INVENTORY_CORRECTION,
                firstPhysicalReceipt ? ProductionSection.MIXING : ProductionSection.BLANKING,
                ProductionSection.BLANKING,
                "ApprovedMaterialBatch",
                saved.getId(),
                "ApprovedMaterialBatch",
                saved.getId(),
                difference,
                "kg",
                difference,
                actor,
                (firstPhysicalReceipt ? "Physical compound receipt confirmed: " : "Manual compound receipt correction: ")
                        + previousReceived + " kg → " + received + " kg / " + reason);
        auditService.record(actor, firstPhysicalReceipt ? "RECEIVE_COMPOUND_STOCK" : "UPDATE_COMPOUND_RECEIPT",
                "ApprovedMaterialBatch",
                saved.getId(),
                "received=" + previousReceived + ", available=" + previousAvailable,
                "received=" + received + ", available=" + available + " / " + reason,
                saved.getMixingBatch() == null ? null : saved.getMixingBatch().getId(), null);
        realtimeEventService.productionChanged("BLANKING",
                firstPhysicalReceipt ? "COMPOUND_RECEIVED" : "COMPOUND_RECEIPT_UPDATED",
                saved.getId(), saved.getMixingBatchNumber()
                        + (firstPhysicalReceipt ? " received: " : " receipt updated to ") + received + " kg");
        return approvedMaterialBatch(saved);
    }

    private CompoundStockStatus statusAfterReceipt(
            ApprovedMaterialBatch value,
            BigDecimal received,
            BigDecimal available
    ) {
        if (value.getStockStatus() == CompoundStockStatus.ON_HOLD
                || value.getStockStatus() == CompoundStockStatus.REJECTED) {
            return value.getStockStatus();
        }
        BigDecimal allocated = amount(value.getReservedQuantityKg()).add(amount(value.getConsumedQuantityKg()));
        if (received.signum() == 0 && allocated.signum() == 0) {
            return CompoundStockStatus.AWAITING_RECEIPT;
        }
        if (available.signum() == 0) {
            return CompoundStockStatus.DEPLETED;
        }
        return allocated.signum() > 0 ? CompoundStockStatus.PARTIALLY_USED : CompoundStockStatus.AVAILABLE;
    }

    private BigDecimal amount(BigDecimal value) {
        return value == null ? BigDecimal.ZERO.setScale(3) : value.setScale(3, RoundingMode.HALF_UP);
    }

    private UserAccount currentUser() {
        // The authenticated actor is required by the controller and resolved
        // here through the same service used by all operational commands.
        return currentUserService.requireCurrentUser();
    }

    private String append(String existing, String line) {
        return existing == null || existing.isBlank() ? line : existing + "\n" + line;
    }
}

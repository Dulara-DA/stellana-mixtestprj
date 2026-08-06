package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.BlankReturnView;
import com.stellana.mixing.api.ApiModels.ConfirmBlankReturnRequest;
import com.stellana.mixing.api.ApiModels.CreateBlankReturnRequest;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

import static com.stellana.mixing.api.ApiMapper.blankReturn;

@Service
@RequiredArgsConstructor
public class BlankReturnService {
    private final BlankReturnRepository returnRepository;
    private final BlankingCartRepository cartRepository;
    private final BlankingBatchRepository batchRepository;
    private final CartReceiptRepository receiptRepository;
    private final MouldingProductionRecordRepository productionRepository;
    private final PressRepository pressRepository;
    private final CurrentUserService currentUserService;
    private final ShiftService shiftService;
    private final AuditService auditService;
    private final InventoryLedgerService inventoryLedgerService;
    private final RealtimeEventService realtimeEventService;

    @Transactional(readOnly = true)
    public List<BlankReturnView> list() {
        return returnRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::blankReturn)
                .toList();
    }

    @Transactional
    public BlankReturnView prepare(CreateBlankReturnRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankingCart cart = cartRepository.findByIdForUpdate(request.cartId())
                .orElseThrow(() -> new NotFoundException("Blanking cart not found."));
        Press press = pressRepository.findByIdForUpdate(request.pressId())
                .orElseThrow(() -> new NotFoundException("Press not found."));
        if (!EnumSet.of(BlankingCartStatus.RECEIVED_AT_MOULDING, BlankingCartStatus.PARTIALLY_CONSUMED)
                .contains(cart.getStatus())) {
            throw new BusinessRuleException("Only received or partially consumed carts can return unused blanks.");
        }
        CartReceipt receipt = receiptRepository.findByCartId(cart.getId())
                .orElseThrow(() -> new BusinessRuleException("The cart receipt was not found."));
        if (!receipt.getPress().getId().equals(press.getId())) {
            throw new BusinessRuleException("The selected cart is not held at this press.");
        }
        if (productionRepository.findFirstByCartIdAndEndTimeIsNull(cart.getId()).isPresent()) {
            throw new BusinessRuleException("Complete the active press production record before preparing a return.");
        }
        if (request.quantity() > cart.getRemainingQuantity()
                || request.quantity() > press.getAvailableBlankQuantity()) {
            throw new BusinessRuleException("Return quantity exceeds the available cart or press inventory.");
        }
        BigDecimal averageWeight = cart.getAverageBlankWeightGrams() == null
                ? cart.getBlankingBatch().getAverageBlankWeightGrams()
                : cart.getAverageBlankWeightGrams();
        if (averageWeight == null || averageWeight.signum() <= 0) {
            throw new BusinessRuleException("Average blank weight is required before unused blanks can be returned.");
        }

        cart.setRemainingQuantity(cart.getRemainingQuantity() - request.quantity());
        cart.setStatus(cart.getRemainingQuantity() == 0
                ? BlankingCartStatus.RETURN_PENDING : BlankingCartStatus.PARTIALLY_CONSUMED);
        cartRepository.save(cart);
        press.setAvailableBlankQuantity(press.getAvailableBlankQuantity() - request.quantity());
        press.setLastActivityAt(shiftService.now());
        if (press.getAvailableBlankQuantity() == 0) {
            press.setStatus(PressStatus.WAITING_FOR_BLANKS);
        }
        pressRepository.save(press);

        ShiftService.ShiftContext shift = shiftService.current();
        BlankReturn saved = returnRepository.save(BlankReturn.builder()
                .returnNumber("RET-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase())
                .press(press)
                .cart(cart)
                .blankingBatch(cart.getBlankingBatch())
                .compoundCode(cart.getMaterialCode())
                .compoundBatchNumber(cart.getMixingBatchNumber() == null
                        ? cart.getBlankingBatch().getMixingBatchNumber() : cart.getMixingBatchNumber())
                .itemCode(cart.getItemCode())
                .preparedQuantity(request.quantity())
                .measuredReturnWeightKg(request.measuredReturnWeightKg())
                .averageBlankWeightGrams(averageWeight)
                .returnReason(request.returnReason().trim())
                .sendingOperator(actor)
                .sendingDateTime(shift.serverTime())
                .shift(shift.shift())
                .mouldingNote(trimToNull(request.mouldingNote()))
                .status(BlankReturnStatus.RETURN_PREPARED)
                .build());
        inventoryLedgerService.record(
                InventoryTransactionType.RETURN_RESERVED,
                ProductionSection.MOULDING,
                ProductionSection.BLANKING,
                "Press",
                press.getId(),
                "BlankReturn",
                saved.getId(),
                BigDecimal.valueOf(saved.getPreparedQuantity()),
                "pieces",
                saved.getMeasuredReturnWeightKg(),
                actor,
                saved.getReturnNumber());
        auditService.record(actor, "PREPARE_BLANK_RETURN", "BlankReturn", saved.getId(), null,
                saved.getReturnNumber() + " / " + saved.getPreparedQuantity() + " pieces / "
                        + saved.getMeasuredReturnWeightKg() + " kg",
                null, null);
        publish("BLANK_RETURN_PREPARED", saved);
        return blankReturn(saved);
    }

    @Transactional
    public BlankReturnView send(Long id) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankReturn value = requireForUpdate(id);
        if (value.getStatus() != BlankReturnStatus.RETURN_PREPARED) {
            throw new BusinessRuleException("Only a prepared return can be sent to Blanking.");
        }
        value.setStatus(BlankReturnStatus.SENT_TO_BLANKING);
        BlankReturn saved = returnRepository.save(value);
        inventoryLedgerService.record(
                InventoryTransactionType.RETURN_SENT,
                ProductionSection.MOULDING,
                ProductionSection.BLANKING,
                "BlankReturn",
                saved.getId(),
                "BlankingBatch",
                saved.getBlankingBatch().getId(),
                BigDecimal.valueOf(saved.getPreparedQuantity()),
                "pieces",
                saved.getMeasuredReturnWeightKg(),
                actor,
                saved.getReturnNumber());
        auditService.record(actor, "SEND_BLANK_RETURN", "BlankReturn", saved.getId(),
                "RETURN_PREPARED", "SENT_TO_BLANKING", null, null);
        publish("BLANK_RETURN_SENT", saved);
        return blankReturn(saved);
    }

    @Transactional
    public BlankReturnView confirm(Long id, ConfirmBlankReturnRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankReturn value = requireForUpdate(id);
        if (!EnumSet.of(BlankReturnStatus.SENT_TO_BLANKING, BlankReturnStatus.AWAITING_CONFIRMATION,
                BlankReturnStatus.QUANTITY_DISPUTED)
                .contains(value.getStatus())) {
            throw new BusinessRuleException("Only a return awaiting Blanking can be confirmed.");
        }
        boolean resolvingDispute = value.getStatus() == BlankReturnStatus.QUANTITY_DISPUTED;
        boolean supervisor = EnumSet.of(Role.BLANKING_SUPERVISOR, Role.MANAGER, Role.SYSTEM_ADMIN)
                .contains(actor.getRole());
        if (resolvingDispute && !supervisor) {
            throw new BusinessRuleException("A Blanking Supervisor, Manager, or System Administrator must resolve this return variance.");
        }
        int quantityVariance = request.receivedQuantity() - value.getPreparedQuantity();
        BigDecimal weightVariance = request.receivedWeightKg().subtract(value.getMeasuredReturnWeightKg())
                .setScale(3, RoundingMode.HALF_UP);
        boolean disputed = quantityVariance != 0 || weightVariance.abs().compareTo(new BigDecimal("0.001")) > 0;
        if (disputed && !StringUtils.hasText(request.varianceNote())) {
            throw new BusinessRuleException("A variance note is required when returned quantity or weight differs.");
        }
        if (disputed && !supervisor) {
            value.setReceivingOperator(actor);
            value.setReceivingDateTime(shiftService.now());
            value.setReceivedQuantity(request.receivedQuantity());
            value.setReceivedWeightKg(request.receivedWeightKg());
            value.setQuantityVariance(quantityVariance);
            value.setWeightVarianceKg(weightVariance);
            value.setVarianceNote(request.varianceNote().trim());
            value.setStatus(BlankReturnStatus.QUANTITY_DISPUTED);
            BlankReturn reported = returnRepository.save(value);
            auditService.record(actor, "REPORT_BLANK_RETURN_VARIANCE", "BlankReturn", reported.getId(),
                    "Sent " + reported.getPreparedQuantity() + " / " + reported.getMeasuredReturnWeightKg() + " kg",
                    "Counted " + request.receivedQuantity() + " / " + request.receivedWeightKg()
                            + " kg / " + request.varianceNote().trim(),
                    null, null);
            publish("BLANK_RETURN_VARIANCE", reported);
            return blankReturn(reported);
        }

        BlankingBatch batch = batchRepository.findByIdForUpdate(value.getBlankingBatch().getId())
                .orElseThrow(() -> new NotFoundException("Blanking batch not found."));
        BlankingCart cart = cartRepository.findByIdForUpdate(value.getCart().getId())
                .orElseThrow(() -> new NotFoundException("Blanking cart not found."));
        batch.setAvailableGoodBlankQuantity(batch.getAvailableGoodBlankQuantity() + request.receivedQuantity());
        batchRepository.save(batch);
        cart.setReturnedQuantity((cart.getReturnedQuantity() == null ? 0 : cart.getReturnedQuantity())
                + request.receivedQuantity());
        cart.setStatus(cart.getRemainingQuantity() == 0
                ? BlankingCartStatus.RETURNED_TO_BLANKING : BlankingCartStatus.PARTIALLY_CONSUMED);
        cartRepository.save(cart);

        if (value.getReceivingOperator() == null) {
            value.setReceivingOperator(actor);
        }
        if (value.getReceivingDateTime() == null) {
            value.setReceivingDateTime(shiftService.now());
        }
        value.setReceivedQuantity(request.receivedQuantity());
        value.setReceivedWeightKg(request.receivedWeightKg());
        value.setQuantityVariance(quantityVariance);
        value.setWeightVarianceKg(weightVariance);
        value.setVarianceNote(trimToNull(request.varianceNote()));
        value.setStatus(BlankReturnStatus.CLOSED);
        BlankReturn saved = returnRepository.save(value);
        inventoryLedgerService.record(
                InventoryTransactionType.RETURN_CONFIRMED,
                ProductionSection.MOULDING,
                ProductionSection.BLANKING,
                "BlankReturn",
                saved.getId(),
                "BlankingBatch",
                batch.getId(),
                BigDecimal.valueOf(request.receivedQuantity()),
                "pieces",
                request.receivedWeightKg(),
                actor,
                saved.getReturnNumber() + (disputed ? " / supervisor accepted variance" : " / balanced"));
        auditService.record(actor, "CONFIRM_BLANK_RETURN", "BlankReturn", saved.getId(),
                "Sent " + saved.getPreparedQuantity() + " / " + saved.getMeasuredReturnWeightKg() + " kg",
                "Received " + request.receivedQuantity() + " / " + request.receivedWeightKg()
                        + " kg / status " + saved.getStatus()
                        + (disputed ? " / " + request.varianceNote().trim() : ""),
                null, null);
        publish(disputed ? "BLANK_RETURN_VARIANCE_RESOLVED" : "BLANK_RETURN_CONFIRMED", saved);
        return blankReturn(saved);
    }

    private BlankReturn requireForUpdate(Long id) {
        return returnRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NotFoundException("Blank return not found."));
    }

    private void publish(String eventType, BlankReturn value) {
        String message = value.getReturnNumber() + " / " + value.getPreparedQuantity() + " pieces";
        realtimeEventService.productionChanged("MOULDING", eventType, value.getId(), message);
        realtimeEventService.productionChanged("BLANKING", eventType, value.getId(), message);
    }

    private String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}

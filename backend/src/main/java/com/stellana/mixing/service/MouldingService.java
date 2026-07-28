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

import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.List;

import static com.stellana.mixing.api.ApiMapper.*;

@Service
@RequiredArgsConstructor
public class MouldingService {
    private static final EnumSet<ShortageStatus> OPEN_SHORTAGE_STATUSES =
            EnumSet.of(ShortageStatus.OPEN, ShortageStatus.ACKNOWLEDGED, ShortageStatus.PREPARING,
                    ShortageStatus.DISPATCHED);

    private final PressRepository pressRepository;
    private final BlankingCartRepository blankingCartRepository;
    private final CartTransferRepository cartTransferRepository;
    private final CartReceiptRepository cartReceiptRepository;
    private final MouldingProductionRecordRepository recordRepository;
    private final MaterialShortageRequestRepository shortageRequestRepository;
    private final CurrentUserService currentUserService;
    private final ShiftService shiftService;
    private final AuditService auditService;
    private final RealtimeEventService realtimeEventService;

    @Transactional(readOnly = true)
    public List<PressView> listPresses() {
        ProductionShift shift = shiftService.current().shift();
        List<MaterialShortageRequest> shortages = shortageRequestRepository.findAllByOrderByCreatedAtDesc();
        return pressRepository.findAllByActiveTrueOrderByPressNumberAsc().stream()
                .map(value -> press(
                        value,
                        shift,
                        blankingCartRepository.countByDestinationPressIdAndStatus(
                                value.getId(), BlankingCartStatus.DISPATCHED),
                        estimatedRequirement(value.getId(), shortages)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BlankingCartView> upcomingCarts() {
        return blankingCartRepository.findAllByStatusInOrderByCreatedAtDesc(
                        EnumSet.of(BlankingCartStatus.PREPARED, BlankingCartStatus.DISPATCHED))
                .stream().map(com.stellana.mixing.api.ApiMapper::blankingCart).toList();
    }

    @Transactional(readOnly = true)
    public List<CartReceiptView> receipts() {
        return cartReceiptRepository.findAllByOrderByReceivedAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::cartReceipt)
                .toList();
    }

    @Transactional
    public CartReceiptView receiveCart(Long cartId, ReceiveCartRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankingCart cart = blankingCartRepository.findById(cartId)
                .orElseThrow(() -> new NotFoundException("Blanking cart not found."));
        if (cart.getStatus() != BlankingCartStatus.DISPATCHED) {
            throw new BusinessRuleException("Only a dispatched cart can be received.");
        }
        if (cartReceiptRepository.existsByCartId(cart.getId())) {
            throw new BusinessRuleException("This cart has already been received.");
        }
        Press press = pressRepository.findById(request.pressId())
                .filter(Press::isActive)
                .orElseThrow(() -> new NotFoundException("Receiving press not found or inactive."));

        boolean wrongPress = !cart.getDestinationPress().getId().equals(press.getId());
        boolean authorizedOverride = Boolean.TRUE.equals(request.supervisorOverride())
                && isSupervisorOrManager(actor);
        if (wrongPress && (!authorizedOverride || !StringUtils.hasText(request.overrideReason()))) {
            throw new BusinessRuleException(
                    "The cart must be received at its destination press unless an authorized supervisor supplies a reason.");
        }
        ShiftService.ShiftContext shift = shiftService.current();
        CartReceiptStatus receiptStatus = wrongPress
                ? CartReceiptStatus.RECEIVED_WITH_OVERRIDE
                : CartReceiptStatus.RECEIVED;

        cart.setStatus(BlankingCartStatus.RECEIVED_AT_MOULDING);
        BlankingCart savedCart = blankingCartRepository.save(cart);
        CartTransfer transfer = cartTransferRepository.findByCartId(cart.getId())
                .orElseThrow(() -> new BusinessRuleException("Cart dispatch transaction was not found."));
        transfer.setStatus(CartTransferStatus.RECEIVED);
        cartTransferRepository.save(transfer);

        press.setAvailableBlankQuantity(press.getAvailableBlankQuantity() + cart.getQuantity());
        press.setCurrentBlankingBatch(cart.getBlankingBatch());
        press.setCurrentOperator(actor);
        press.setLastActivityAt(shift.serverTime());
        if (press.getStatus() == PressStatus.WAITING_FOR_BLANKS) {
            press.setStatus(PressStatus.IDLE);
        }
        Press savedPress = pressRepository.save(press);

        CartReceipt receipt = cartReceiptRepository.save(CartReceipt.builder()
                .cart(savedCart)
                .receivedQuantity(savedCart.getQuantity())
                .productionDate(shift.productionDate())
                .shift(shift.shift())
                .receivedAt(shift.serverTime())
                .receivingOperator(actor)
                .receivingOperatorEmployeeId(employeeId(actor))
                .press(savedPress)
                .sendingOperator(savedCart.getDispatchedBy())
                .dispatchTime(savedCart.getDispatchedAt())
                .receiptStatus(receiptStatus)
                .overrideReason(wrongPress ? request.overrideReason().trim() : null)
                .build());

        shortageRequestRepository.findFirstByLinkedCartId(cart.getId()).ifPresent(shortage -> {
            shortage.setStatus(ShortageStatus.FULFILLED);
            shortage.addMessage(RequestMessage.builder()
                    .sender(actor)
                    .message("Cart " + savedCart.getCartNumber() + " received at "
                            + savedPress.getPressNumber() + "; request fulfilled.")
                    .statusSnapshot(ShortageStatus.FULFILLED)
                    .build());
            shortageRequestRepository.save(shortage);
            realtimeEventService.shortagesChanged("SHORTAGE_FULFILLED", shortage.getId(),
                    shortage.getRequestNumber() + " fulfilled");
        });

        auditService.record(actor, "RECEIVE_BLANKING_CART", "CartReceipt", receipt.getId(), null,
                savedCart.getCartNumber() + " / " + savedCart.getQuantity() + " blanks / "
                        + savedPress.getPressNumber()
                        + (wrongPress ? " / OVERRIDE: " + request.overrideReason().trim() : ""),
                null, null);
        realtimeEventService.productionChanged("MOULDING", "CART_RECEIVED", savedCart.getId(),
                savedCart.getCartNumber() + " received at " + savedPress.getPressNumber());
        return cartReceipt(receipt);
    }

    @Transactional(readOnly = true)
    public List<MouldingProductionRecordView> listRecords() {
        return recordRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::mouldingRecord)
                .toList();
    }

    @Transactional
    public MouldingProductionRecordView startRecord(StartMouldingRecordRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        Press press = pressRepository.findById(request.pressId())
                .filter(Press::isActive)
                .orElseThrow(() -> new NotFoundException("Press not found or inactive."));
        BlankingCart cart = blankingCartRepository.findById(request.cartId())
                .orElseThrow(() -> new NotFoundException("Blanking cart not found."));
        if (!EnumSet.of(BlankingCartStatus.RECEIVED_AT_MOULDING, BlankingCartStatus.PARTIALLY_CONSUMED)
                .contains(cart.getStatus())) {
            throw new BusinessRuleException("The selected cart must be received at Moulding before production starts.");
        }
        CartReceipt receipt = cartReceiptRepository.findByCartId(cart.getId())
                .orElseThrow(() -> new BusinessRuleException("Cart receipt was not found."));
        if (!receipt.getPress().getId().equals(press.getId())) {
            throw new BusinessRuleException("The cart is not held at the selected press.");
        }
        if (cart.getRemainingQuantity() <= 0) {
            throw new BusinessRuleException("The selected cart has no blanks remaining.");
        }
        if (press.getAvailableBlankQuantity() < cart.getRemainingQuantity()) {
            throw new BusinessRuleException("Press inventory is lower than the cart balance. Reconcile inventory first.");
        }
        if (recordRepository.findFirstByCartIdAndEndTimeIsNull(cart.getId()).isPresent()) {
            throw new BusinessRuleException("This cart already has an active Moulding production record.");
        }

        ShiftService.ShiftContext shift = shiftService.current();
        MouldingProductionRecord saved = recordRepository.save(MouldingProductionRecord.builder()
                .press(press)
                .productionDate(shift.productionDate())
                .shift(shift.shift())
                .startTime(shift.serverTime())
                .operator(actor)
                .operatorEmployeeId(employeeId(actor))
                .cart(cart)
                .blankingBatch(cart.getBlankingBatch())
                .quantityReceived(cart.getRemainingQuantity())
                .remainingBlankQuantity(cart.getRemainingQuantity())
                .status(MouldingRecordStatus.IN_PROGRESS)
                .build());
        press.setStatus(PressStatus.RUNNING);
        press.setCurrentOperator(actor);
        press.setCurrentBlankingBatch(cart.getBlankingBatch());
        press.setLastActivityAt(shift.serverTime());
        pressRepository.save(press);
        auditService.record(actor, "START_MOULDING_RECORD", "MouldingProductionRecord", saved.getId(), null,
                press.getPressNumber() + " / " + cart.getCartNumber() + " / "
                        + saved.getQuantityReceived() + " blanks", null, null);
        realtimeEventService.productionChanged("MOULDING", "MOULDING_RECORD_STARTED", saved.getId(),
                press.getPressNumber() + " started " + cart.getCartNumber());
        return mouldingRecord(saved);
    }

    @Transactional
    public MouldingProductionRecordView completeRecord(Long id, CompleteMouldingRecordRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        MouldingProductionRecord record = requireRecord(id);
        if (record.getStatus() != MouldingRecordStatus.IN_PROGRESS || record.getEndTime() != null) {
            throw new BusinessRuleException("Only an active Moulding record can be completed.");
        }
        validateDowntime(request.downtimeMinutes(), request.downtimeReason());
        int used = totalUsed(request.goodTyreQuantity(), request.rejectedTyreQuantity(),
                request.rejectedBlankQuantity());
        if (used > record.getQuantityReceived()) {
            throw new BusinessRuleException("Good, rejected tyre, and rejected blank quantities exceed received blanks.");
        }
        BlankingCart cart = record.getCart();
        Press press = record.getPress();
        if (used > cart.getRemainingQuantity() || used > press.getAvailableBlankQuantity()) {
            throw new BusinessRuleException("Production quantities exceed the current cart or press inventory.");
        }

        int remaining = record.getQuantityReceived() - used;
        BigDecimal totalRejectedWeight = request.rejectedTyreWeightPerItemGrams()
                .multiply(BigDecimal.valueOf(request.rejectedTyreQuantity()));
        record.setGoodTyreQuantity(request.goodTyreQuantity());
        record.setRejectedTyreQuantity(request.rejectedTyreQuantity());
        record.setRejectedTyreWeightPerItemGrams(request.rejectedTyreWeightPerItemGrams());
        record.setTotalRejectedTyreWeightGrams(totalRejectedWeight);
        record.setRejectedBlankQuantity(request.rejectedBlankQuantity());
        record.setRemainingBlankQuantity(remaining);
        record.setDowntimeMinutes(request.downtimeMinutes());
        record.setDowntimeReason(trimToNull(request.downtimeReason()));
        record.setOperatorNote(trimToNull(request.operatorNote()));
        record.setEndTime(shiftService.now());
        record.setStatus(MouldingRecordStatus.COMPLETED);

        cart.setRemainingQuantity(cart.getRemainingQuantity() - used);
        cart.setStatus(cart.getRemainingQuantity() == 0
                ? BlankingCartStatus.FULLY_CONSUMED
                : BlankingCartStatus.PARTIALLY_CONSUMED);
        blankingCartRepository.save(cart);

        press.setAvailableBlankQuantity(press.getAvailableBlankQuantity() - used);
        press.setGoodTyreQuantity(press.getGoodTyreQuantity() + request.goodTyreQuantity());
        press.setRejectedTyreQuantity(press.getRejectedTyreQuantity() + request.rejectedTyreQuantity());
        press.setRejectedBlankQuantity(press.getRejectedBlankQuantity() + request.rejectedBlankQuantity());
        press.setLastActivityAt(record.getEndTime());
        press.setStatus(press.getAvailableBlankQuantity() == 0
                ? PressStatus.WAITING_FOR_BLANKS
                : PressStatus.IDLE);
        pressRepository.save(press);

        MouldingProductionRecord saved = recordRepository.save(record);
        auditService.record(actor, "COMPLETE_MOULDING_RECORD", "MouldingProductionRecord", saved.getId(),
                "IN_PROGRESS",
                "COMPLETED / good " + request.goodTyreQuantity()
                        + " / rejected tyres " + request.rejectedTyreQuantity()
                        + " / rejected blanks " + request.rejectedBlankQuantity()
                        + " / remaining " + remaining,
                null, null);
        realtimeEventService.productionChanged("MOULDING", "MOULDING_RECORD_COMPLETED", saved.getId(),
                press.getPressNumber() + " completed " + cart.getCartNumber());
        return mouldingRecord(saved);
    }

    @Transactional
    public MouldingProductionRecordView correctRecord(Long id, CorrectMouldingRecordRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        if (!isManager(actor)) {
            throw new BusinessRuleException("Only a Manager or System Administrator may correct production records.");
        }
        MouldingProductionRecord record = requireRecord(id);
        if (record.getStatus() != MouldingRecordStatus.COMPLETED) {
            throw new BusinessRuleException("Only a completed production record can be corrected.");
        }
        validateDowntime(request.downtimeMinutes(), request.downtimeReason());
        int oldUsed = totalUsed(record.getGoodTyreQuantity(), record.getRejectedTyreQuantity(),
                record.getRejectedBlankQuantity());
        int newUsed = totalUsed(request.goodTyreQuantity(), request.rejectedTyreQuantity(),
                request.rejectedBlankQuantity());
        if (newUsed > record.getQuantityReceived()) {
            throw new BusinessRuleException("Corrected quantities exceed the blanks originally received.");
        }
        int inventoryAdjustment = oldUsed - newUsed;
        Press press = record.getPress();
        BlankingCart cart = record.getCart();
        int correctedPressInventory = press.getAvailableBlankQuantity() + inventoryAdjustment;
        int correctedCartRemaining = cart.getRemainingQuantity() + inventoryAdjustment;
        if (correctedPressInventory < 0 || correctedCartRemaining < 0
                || correctedCartRemaining > cart.getQuantity()) {
            throw new BusinessRuleException("The correction would make press or cart inventory invalid.");
        }

        String previous = recordSummary(record);
        press.setAvailableBlankQuantity(correctedPressInventory);
        press.setGoodTyreQuantity(nonNegative(
                press.getGoodTyreQuantity() - record.getGoodTyreQuantity() + request.goodTyreQuantity()));
        press.setRejectedTyreQuantity(nonNegative(
                press.getRejectedTyreQuantity() - record.getRejectedTyreQuantity()
                        + request.rejectedTyreQuantity()));
        press.setRejectedBlankQuantity(nonNegative(
                press.getRejectedBlankQuantity() - record.getRejectedBlankQuantity()
                        + request.rejectedBlankQuantity()));
        press.setLastActivityAt(shiftService.now());
        pressRepository.save(press);

        cart.setRemainingQuantity(correctedCartRemaining);
        cart.setStatus(correctedCartRemaining == 0
                ? BlankingCartStatus.FULLY_CONSUMED
                : BlankingCartStatus.PARTIALLY_CONSUMED);
        blankingCartRepository.save(cart);

        record.setGoodTyreQuantity(request.goodTyreQuantity());
        record.setRejectedTyreQuantity(request.rejectedTyreQuantity());
        record.setRejectedTyreWeightPerItemGrams(request.rejectedTyreWeightPerItemGrams());
        record.setTotalRejectedTyreWeightGrams(request.rejectedTyreWeightPerItemGrams()
                .multiply(BigDecimal.valueOf(request.rejectedTyreQuantity())));
        record.setRejectedBlankQuantity(request.rejectedBlankQuantity());
        record.setRemainingBlankQuantity(record.getQuantityReceived() - newUsed);
        record.setDowntimeMinutes(request.downtimeMinutes());
        record.setDowntimeReason(trimToNull(request.downtimeReason()));
        record.setOperatorNote(trimToNull(request.operatorNote()));
        MouldingProductionRecord saved = recordRepository.save(record);

        auditService.record(actor, "CORRECT_MOULDING_RECORD", "MouldingProductionRecord", saved.getId(),
                previous,
                recordSummary(saved) + " / reason: " + request.correctionReason().trim(),
                null, null);
        realtimeEventService.productionChanged("MOULDING", "MOULDING_RECORD_CORRECTED", saved.getId(),
                "Production record " + saved.getId() + " corrected by " + actor.getFullName());
        return mouldingRecord(saved);
    }

    @Transactional
    public PressView changePressStatus(Long id, PressStatusRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        Press value = pressRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Press not found."));
        if ((request.status() == PressStatus.STOPPED || request.status() == PressStatus.MAINTENANCE)
                && !StringUtils.hasText(request.reason())) {
            throw new BusinessRuleException("A reason is required when stopping a press or placing it in maintenance.");
        }
        PressStatus previous = value.getStatus();
        value.setStatus(request.status());
        value.setCurrentOperator(actor);
        value.setLastActivityAt(shiftService.now());
        Press saved = pressRepository.save(value);
        auditService.record(actor, "CHANGE_PRESS_STATUS", "Press", saved.getId(), previous.name(),
                request.status().name()
                        + (StringUtils.hasText(request.reason()) ? " / " + request.reason().trim() : ""),
                null, null);
        realtimeEventService.productionChanged("MOULDING", "PRESS_STATUS_CHANGED", saved.getId(),
                saved.getPressNumber() + " changed to " + saved.getStatus());
        return press(saved, shiftService.current().shift(),
                blankingCartRepository.countByDestinationPressIdAndStatus(saved.getId(), BlankingCartStatus.DISPATCHED),
                0);
    }

    private MouldingProductionRecord requireRecord(Long id) {
        return recordRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Moulding production record not found."));
    }

    private int estimatedRequirement(Long pressId, List<MaterialShortageRequest> shortages) {
        return shortages.stream()
                .filter(request -> request.getPress().getId().equals(pressId))
                .filter(request -> OPEN_SHORTAGE_STATUSES.contains(request.getStatus()))
                .mapToInt(MaterialShortageRequest::getRequestedBlankQuantity)
                .max()
                .orElse(0);
    }

    private int totalUsed(int good, int rejectedTyres, int rejectedBlanks) {
        return Math.addExact(Math.addExact(good, rejectedTyres), rejectedBlanks);
    }

    private void validateDowntime(int minutes, String reason) {
        if (minutes > 0 && !StringUtils.hasText(reason)) {
            throw new BusinessRuleException("A downtime reason is required when downtime is recorded.");
        }
    }

    private boolean isSupervisorOrManager(UserAccount actor) {
        return EnumSet.of(Role.MOULDING_SUPERVISOR, Role.MANAGER, Role.SYSTEM_ADMIN)
                .contains(actor.getRole());
    }

    private boolean isManager(UserAccount actor) {
        return actor.getRole() == Role.MANAGER || actor.getRole() == Role.SYSTEM_ADMIN;
    }

    private String employeeId(UserAccount user) {
        return StringUtils.hasText(user.getEmployeeId()) ? user.getEmployeeId() : "USER-" + user.getId();
    }

    private String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private int nonNegative(int value) {
        if (value < 0) {
            throw new BusinessRuleException("The correction would make a press total negative.");
        }
        return value;
    }

    private String recordSummary(MouldingProductionRecord record) {
        return "good " + record.getGoodTyreQuantity()
                + " / rejected tyres " + record.getRejectedTyreQuantity()
                + " / rejected blanks " + record.getRejectedBlankQuantity()
                + " / rejected weight " + record.getTotalRejectedTyreWeightGrams() + " g"
                + " / remaining " + record.getRemainingBlankQuantity();
    }
}

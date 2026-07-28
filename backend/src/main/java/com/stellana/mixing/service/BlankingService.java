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
        ApprovedMaterialBatch approved = approvedMaterialBatchRepository.findById(request.approvedMaterialBatchId())
                .orElseThrow(() -> new NotFoundException("Approved material batch not found."));
        if (!approved.isActive() || approved.getLabStatus() != LabDecision.PASS) {
            throw new BusinessRuleException("Only an active laboratory-passed material batch can enter Blanking.");
        }
        if (approved.getAvailableQuantityKg().compareTo(request.materialConsumedKg()) < 0) {
            throw new BusinessRuleException("Material consumption exceeds the approved batch quantity available.");
        }

        ShiftService.ShiftContext shift = shiftService.current();
        boolean startImmediately = Boolean.TRUE.equals(request.startImmediately());
        approved.setAvailableQuantityKg(approved.getAvailableQuantityKg().subtract(request.materialConsumedKg()));
        approvedMaterialBatchRepository.save(approved);

        BlankingBatch saved = blankingBatchRepository.save(BlankingBatch.builder()
                .batchNumber(request.batchNumber().trim().toUpperCase())
                .approvedMaterialBatch(approved)
                .mixingBatchNumber(approved.getMixingBatchNumber())
                .materialCode(approved.getMaterialCode())
                .materialConsumedKg(request.materialConsumedKg())
                .plannedProductionQuantity(request.plannedProductionQuantity())
                .productionDate(shift.productionDate())
                .shift(shift.shift())
                .startTime(startImmediately ? shift.serverTime() : null)
                .operator(actor)
                .operatorEmployeeId(employeeId(actor))
                .notes(trimToNull(request.notes()))
                .status(startImmediately ? BlankingBatchStatus.IN_PROGRESS : BlankingBatchStatus.PLANNED)
                .build());
        auditService.record(actor, "CREATE_BLANKING_BATCH", "BlankingBatch", saved.getId(), null,
                saved.getBatchNumber() + " / " + saved.getMixingBatchNumber()
                        + " / planned " + saved.getPlannedProductionQuantity() + " blanks",
                approved.getMixingBatch() == null ? null : approved.getMixingBatch().getId(), null);
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
        BlankingBatch value = requireBatch(id);
        if (value.getStatus() != BlankingBatchStatus.IN_PROGRESS) {
            throw new BusinessRuleException("Only an in-progress Blanking batch can be completed.");
        }
        if (request.rejectedQuantity() > request.productionQuantity()) {
            throw new BusinessRuleException("Rejected quantity cannot exceed total produced quantity.");
        }
        int goodQuantity = request.productionQuantity() - request.rejectedQuantity();
        value.setProductionQuantity(request.productionQuantity());
        value.setRejectedQuantity(request.rejectedQuantity());
        value.setAvailableGoodBlankQuantity(goodQuantity);
        value.setEndTime(shiftService.now());
        value.setStatus(BlankingBatchStatus.READY);
        if (StringUtils.hasText(request.notes())) {
            value.setNotes(request.notes().trim());
        }
        BlankingBatch saved = blankingBatchRepository.save(value);
        auditService.record(actor, "COMPLETE_BLANKING_BATCH", "BlankingBatch", saved.getId(),
                "IN_PROGRESS", "READY / good " + goodQuantity + " / rejected " + request.rejectedQuantity(),
                null, null);
        realtimeEventService.productionChanged("BLANKING", "BLANKING_BATCH_COMPLETED", saved.getId(),
                saved.getBatchNumber() + " completed with " + goodQuantity + " good blanks");
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
        BlankingBatch batch = requireBatch(request.blankingBatchId());
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

        batch.setAvailableGoodBlankQuantity(batch.getAvailableGoodBlankQuantity() - request.quantity());
        blankingBatchRepository.save(batch);
        BlankingCart saved = blankingCartRepository.save(BlankingCart.builder()
                .cartNumber(request.cartNumber().trim().toUpperCase())
                .blankingBatch(batch)
                .materialCode(batch.getMaterialCode())
                .quantity(request.quantity())
                .remainingQuantity(request.quantity())
                .createdBy(actor)
                .destinationPress(press)
                .status(BlankingCartStatus.PREPARED)
                .blankingNote(trimToNull(request.blankingNote()))
                .build());

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
                saved.getCartNumber() + " / " + saved.getQuantity() + " blanks / " + press.getPressNumber(),
                null, null);
        realtimeEventService.productionChanged("BLANKING", "CART_PREPARED", saved.getId(),
                saved.getCartNumber() + " prepared for " + press.getPressNumber());
        return blankingCart(saved);
    }

    @Transactional
    public BlankingCartView dispatchCart(Long id, DispatchCartRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        BlankingCart cart = requireCart(id);
        if (cart.getStatus() != BlankingCartStatus.PREPARED) {
            throw new BusinessRuleException("Only a prepared cart can be dispatched.");
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
                .noneMatch(cart -> cart.getStatus() == BlankingCartStatus.PREPARED);
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
}

package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.BlankingBatchRepository;
import com.stellana.mixing.repository.BlankingCartRepository;
import com.stellana.mixing.repository.MaterialShortageRequestRepository;
import com.stellana.mixing.repository.PressRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.format.DateTimeFormatter;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static com.stellana.mixing.api.ApiMapper.shortageRequest;

@Service
@RequiredArgsConstructor
public class ShortageService {
    private static final Map<ShortageStatus, Set<ShortageStatus>> TRANSITIONS = transitions();

    private final MaterialShortageRequestRepository shortageRequestRepository;
    private final PressRepository pressRepository;
    private final BlankingBatchRepository blankingBatchRepository;
    private final BlankingCartRepository blankingCartRepository;
    private final CurrentUserService currentUserService;
    private final ShiftService shiftService;
    private final AuditService auditService;
    private final RealtimeEventService realtimeEventService;

    @Transactional(readOnly = true)
    public List<MaterialShortageRequestView> list() {
        return shortageRequestRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::shortageRequest)
                .toList();
    }

    @Transactional
    public MaterialShortageRequestView create(CreateShortageRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        Press press = pressRepository.findById(request.pressId())
                .filter(Press::isActive)
                .orElseThrow(() -> new NotFoundException("Press not found or inactive."));
        BlankingBatch currentBatch = request.currentBlankingBatchId() == null
                ? press.getCurrentBlankingBatch()
                : blankingBatchRepository.findById(request.currentBlankingBatchId())
                .orElseThrow(() -> new NotFoundException("Current Blanking batch not found."));
        ShiftService.ShiftContext shift = shiftService.current();
        String requestNumber = newRequestNumber(shift);
        MaterialShortageRequest value = MaterialShortageRequest.builder()
                .requestNumber(requestNumber)
                .press(press)
                .currentBlankingBatch(currentBatch)
                .currentAvailableBlankQuantity(press.getAvailableBlankQuantity())
                .requestedBlankQuantity(request.requestedBlankQuantity())
                .requiredMaterialCode(request.requiredMaterialCode().trim().toUpperCase())
                .requiredAt(request.requiredAt())
                .priority(request.priority())
                .sender(actor)
                .senderEmployeeId(employeeId(actor))
                .productionDate(shift.productionDate())
                .senderShift(shift.shift())
                .status(ShortageStatus.OPEN)
                .build();
        value.addMessage(RequestMessage.builder()
                .sender(actor)
                .message(request.message().trim())
                .statusSnapshot(ShortageStatus.OPEN)
                .build());
        MaterialShortageRequest saved = shortageRequestRepository.save(value);
        auditService.record(actor, "CREATE_SHORTAGE_REQUEST", "MaterialShortageRequest", saved.getId(), null,
                saved.getRequestNumber() + " / " + press.getPressNumber() + " / "
                        + saved.getRequestedBlankQuantity() + " blanks / " + saved.getPriority(),
                null, null);
        realtimeEventService.shortagesChanged("SHORTAGE_CREATED", saved.getId(),
                saved.getRequestNumber() + " created for " + press.getPressNumber());
        return shortageRequest(saved);
    }

    @Transactional
    public MaterialShortageRequestView updateStatus(Long id, ShortageStatusUpdateRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        MaterialShortageRequest value = requireRequest(id);
        ShortageStatus previous = value.getStatus();
        if (previous == request.status()) {
            return shortageRequest(value);
        }
        if (!TRANSITIONS.getOrDefault(previous, Set.of()).contains(request.status())) {
            throw new BusinessRuleException("Invalid shortage transition from " + previous
                    + " to " + request.status() + ".");
        }
        assertCanChangeStatus(actor, value, request.status());

        if (request.linkedCartId() != null) {
            BlankingCart cart = blankingCartRepository.findById(request.linkedCartId())
                    .orElseThrow(() -> new NotFoundException("Linked cart not found."));
            if (!cart.getDestinationPress().getId().equals(value.getPress().getId())) {
                throw new BusinessRuleException("The linked cart must be destined for the requesting press.");
            }
            value.setLinkedCart(cart);
        }
        if ((request.status() == ShortageStatus.DISPATCHED || request.status() == ShortageStatus.FULFILLED)
                && value.getLinkedCart() == null) {
            throw new BusinessRuleException("A cart must be linked before the request can be dispatched or fulfilled.");
        }
        if (request.status() == ShortageStatus.DISPATCHED
                && value.getLinkedCart().getStatus() == BlankingCartStatus.PREPARED) {
            throw new BusinessRuleException("The linked cart has not been dispatched.");
        }
        value.setStatus(request.status());
        String response = StringUtils.hasText(request.response())
                ? request.response().trim()
                : "Status changed from " + previous + " to " + request.status() + ".";
        value.addMessage(RequestMessage.builder()
                .sender(actor)
                .message(response)
                .statusSnapshot(request.status())
                .build());
        MaterialShortageRequest saved = shortageRequestRepository.save(value);
        auditService.record(actor, "CHANGE_SHORTAGE_STATUS", "MaterialShortageRequest", saved.getId(),
                previous.name(), request.status().name() + " / " + response, null, null);
        realtimeEventService.shortagesChanged("SHORTAGE_STATUS_CHANGED", saved.getId(),
                saved.getRequestNumber() + " changed to " + saved.getStatus());
        return shortageRequest(saved);
    }

    @Transactional
    public MaterialShortageRequestView addMessage(Long id, ShortageMessageRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        MaterialShortageRequest value = requireRequest(id);
        value.addMessage(RequestMessage.builder()
                .sender(actor)
                .message(request.message().trim())
                .statusSnapshot(value.getStatus())
                .build());
        MaterialShortageRequest saved = shortageRequestRepository.save(value);
        auditService.record(actor, "ADD_SHORTAGE_MESSAGE", "MaterialShortageRequest", saved.getId(), null,
                actor.getFullName() + " added a message", null, null);
        realtimeEventService.shortagesChanged("SHORTAGE_MESSAGE_ADDED", saved.getId(),
                "New message on " + saved.getRequestNumber());
        return shortageRequest(saved);
    }

    private MaterialShortageRequest requireRequest(Long id) {
        return shortageRequestRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Shortage request not found."));
    }

    private void assertCanChangeStatus(UserAccount actor, MaterialShortageRequest request, ShortageStatus target) {
        boolean management = actor.getRole() == Role.MANAGER || actor.getRole() == Role.SYSTEM_ADMIN;
        boolean blanking = actor.getRole() == Role.BLANKING_OPERATOR
                || actor.getRole() == Role.BLANKING_SUPERVISOR;
        boolean mouldingSupervisor = actor.getRole() == Role.MOULDING_SUPERVISOR;
        boolean ownCancellation = target == ShortageStatus.CANCELLED
                && actor.getId().equals(request.getSender().getId());
        if (!management && !blanking && !mouldingSupervisor && !ownCancellation) {
            throw new BusinessRuleException("The current role cannot change this shortage request status.");
        }
    }

    private String newRequestNumber(ShiftService.ShiftContext shift) {
        String prefix = "SRQ-" + shift.productionDate().format(DateTimeFormatter.BASIC_ISO_DATE) + "-";
        String number;
        do {
            number = prefix + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        } while (shortageRequestRepository.existsByRequestNumberIgnoreCase(number));
        return number;
    }

    private String employeeId(UserAccount user) {
        return StringUtils.hasText(user.getEmployeeId()) ? user.getEmployeeId() : "USER-" + user.getId();
    }

    private static Map<ShortageStatus, Set<ShortageStatus>> transitions() {
        Map<ShortageStatus, Set<ShortageStatus>> map = new EnumMap<>(ShortageStatus.class);
        map.put(ShortageStatus.OPEN, EnumSet.of(ShortageStatus.ACKNOWLEDGED, ShortageStatus.CANCELLED));
        map.put(ShortageStatus.ACKNOWLEDGED, EnumSet.of(ShortageStatus.PREPARING, ShortageStatus.CANCELLED));
        map.put(ShortageStatus.PREPARING, EnumSet.of(ShortageStatus.DISPATCHED, ShortageStatus.CANCELLED));
        map.put(ShortageStatus.DISPATCHED, EnumSet.of(ShortageStatus.FULFILLED, ShortageStatus.CANCELLED));
        map.put(ShortageStatus.FULFILLED, EnumSet.noneOf(ShortageStatus.class));
        map.put(ShortageStatus.CANCELLED, EnumSet.noneOf(ShortageStatus.class));
        return map;
    }
}

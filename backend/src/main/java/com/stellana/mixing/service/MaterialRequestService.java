package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.MaterialRequestRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.stellana.mixing.api.ApiMapper.materialRequest;

@Service
@RequiredArgsConstructor
public class MaterialRequestService {
    private final MaterialRequestRepository requestRepository;
    private final BatchService batchService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;
    private final NotificationService notificationService;
    private final RealtimeEventService realtimeEventService;

    @Transactional(readOnly = true)
    public List<MaterialRequestView> list() {
        UserAccount current = currentUserService.requireCurrentUser();
        return requestRepository.findAllByOrderByRequestedAtDesc().stream()
                .filter(value -> current.getRole() != Role.MIXING_OFFICER
                        || value.getRequestingOfficer().getId().equals(current.getId()))
                .map(com.stellana.mixing.api.ApiMapper::materialRequest).toList();
    }

    @Transactional
    public MaterialRequestView create(CreateMaterialRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        ProductionBatch batch = batchService.requireBatch(request.batchId());
        if (actor.getRole() == Role.MIXING_OFFICER
                && !batch.getAssignedOfficer().getId().equals(actor.getId())) {
            throw new BusinessRuleException("You can request materials only for an assigned batch.");
        }
        if (!List.of(BatchStatus.PLANNED, BatchStatus.WAITING_FOR_MATERIALS).contains(batch.getStatus())) {
            throw new BusinessRuleException("Materials can be requested only for a planned or waiting batch.");
        }

        MaterialRequest value = MaterialRequest.builder()
                .requestNumber("MR-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS")))
                .batch(batch)
                .requestingOfficer(actor)
                .requestedAt(LocalDateTime.now())
                .status(MaterialRequestStatus.REQUESTED)
                .notes(request.notes())
                .build();

        if (request.items() == null || request.items().isEmpty()) {
            batch.getRecipeRevision().getIngredients().forEach(ingredient -> value.addItem(MaterialRequestItem.builder()
                    .materialCode(ingredient.getMaterialCode())
                    .materialName(ingredient.getMaterialName())
                    .requiredQuantity(ingredient.getRequiredQuantity())
                    .requestedQuantity(ingredient.getRequiredQuantity())
                    .issuedQuantity(BigDecimal.ZERO)
                    .unit(ingredient.getUnit())
                    .build()));
        } else {
            request.items().forEach(item -> value.addItem(MaterialRequestItem.builder()
                    .materialCode(item.materialCode().trim().toUpperCase())
                    .materialName(item.materialName().trim())
                    .requiredQuantity(item.requiredQuantity())
                    .requestedQuantity(item.requestedQuantity())
                    .issuedQuantity(BigDecimal.ZERO)
                    .unit(item.unit().trim())
                    .build()));
        }

        MaterialRequest saved = requestRepository.save(value);
        if (batch.getStatus() == BatchStatus.PLANNED) {
            batch = batchService.transitionInternal(batch, BatchStatus.WAITING_FOR_MATERIALS, actor, "Preparing material request");
        }
        batchService.transitionInternal(batch, BatchStatus.MATERIALS_REQUESTED, actor, saved.getRequestNumber());
        auditService.record(actor, "CREATE_MATERIAL_REQUEST", "MaterialRequest", saved.getId(), null,
                saved.getRequestNumber(), batch.getId(), batch.getRecipeRevision().getRecipe().getId());
        notificationService.notifyRole(Role.MANAGER, NotificationType.BATCH_CHANGED, "Materials requested",
                saved.getRequestNumber() + " for " + batch.getBatchNumber(), "MATERIAL_REQUEST", saved.getId());
        realtimeEventService.dashboardChanged("MATERIAL_REQUESTED", batch.getId(),
                saved.getRequestNumber() + " submitted");
        return materialRequest(saved);
    }

    @Transactional
    public MaterialRequestView issue(Long id, IssueMaterialsRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        MaterialRequest value = requestRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Material request not found."));
        if (value.getStatus() == MaterialRequestStatus.CANCELLED
                || value.getStatus() == MaterialRequestStatus.ISSUED) {
            throw new BusinessRuleException("This material request cannot be issued again.");
        }
        Map<Long, MaterialIssueItem> updates = request.items().stream()
                .collect(Collectors.toMap(MaterialIssueItem::itemId, Function.identity()));
        for (MaterialRequestItem item : value.getItems()) {
            MaterialIssueItem update = updates.get(item.getId());
            if (update != null) {
                if (update.issuedQuantity().compareTo(item.getRequestedQuantity()) > 0) {
                    throw new BusinessRuleException("Issued quantity cannot exceed requested quantity for " + item.getMaterialName() + ".");
                }
                item.setIssuedQuantity(update.issuedQuantity());
                item.setRawMaterialLotNumber(update.rawMaterialLotNumber());
            }
        }
        boolean fullyIssued = value.getItems().stream()
                .allMatch(item -> item.getIssuedQuantity().compareTo(item.getRequestedQuantity()) >= 0);
        value.setStatus(fullyIssued ? MaterialRequestStatus.ISSUED : MaterialRequestStatus.PARTIALLY_ISSUED);
        value.setIssuedBy(actor);
        value.setIssuedAt(LocalDateTime.now());
        if (StringUtils.hasText(request.notes())) {
            value.setNotes(StringUtils.hasText(value.getNotes())
                    ? value.getNotes() + "\nIssue note: " + request.notes()
                    : request.notes());
        }
        MaterialRequest saved = requestRepository.save(value);
        if (fullyIssued) {
            batchService.transitionInternal(saved.getBatch(), BatchStatus.MATERIALS_ISSUED, actor, saved.getRequestNumber());
        }
        auditService.record(actor, "ISSUE_MATERIALS", "MaterialRequest", saved.getId(),
                MaterialRequestStatus.REQUESTED.name(), saved.getStatus().name(),
                saved.getBatch().getId(), saved.getBatch().getRecipeRevision().getRecipe().getId());
        notificationService.notifyUser(saved.getRequestingOfficer(), NotificationType.MATERIALS_ISSUED,
                fullyIssued ? "Materials issued" : "Materials partially issued",
                saved.getRequestNumber() + " was updated.", "MATERIAL_REQUEST", saved.getId());
        realtimeEventService.dashboardChanged("MATERIALS_ISSUED", saved.getBatch().getId(),
                saved.getRequestNumber() + " updated");
        return materialRequest(saved);
    }
}

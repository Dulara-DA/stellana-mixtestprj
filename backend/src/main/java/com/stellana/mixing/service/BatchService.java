package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.BatchTransitionRequest;
import com.stellana.mixing.api.ApiModels.BatchView;
import com.stellana.mixing.api.ApiModels.CreateBatchRequest;
import com.stellana.mixing.api.ApiModels.ScheduleBatchRequest;
import com.stellana.mixing.api.ApiModels.StatusHistoryView;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.BatchStatusHistoryRepository;
import com.stellana.mixing.repository.ProductionBatchRepository;
import com.stellana.mixing.repository.RecipeRevisionRepository;
import com.stellana.mixing.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

import static com.stellana.mixing.api.ApiMapper.batch;

@Service
@RequiredArgsConstructor
public class BatchService {
    private static final Map<BatchStatus, Set<BatchStatus>> TRANSITIONS = buildTransitions();

    private final ProductionBatchRepository batchRepository;
    private final BatchStatusHistoryRepository historyRepository;
    private final RecipeRevisionRepository recipeRevisionRepository;
    private final UserAccountRepository userAccountRepository;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;
    private final NotificationService notificationService;
    private final RealtimeEventService realtimeEventService;
    private final ApprovedMaterialService approvedMaterialService;

    @Value("${app.production.mixer-capacity-kg:240}")
    private BigDecimal mixerCapacityKg;

    @Transactional(readOnly = true)
    public List<BatchView> list() {
        UserAccount current = currentUserService.requireCurrentUser();
        List<ProductionBatch> batches = current.getRole() == Role.MIXING_OFFICER
                ? batchRepository.findAllByAssignedOfficerIdOrderByCreatedAtDesc(current.getId())
                : batchRepository.findAllByOrderByCreatedAtDesc();
        return batches.stream().map(com.stellana.mixing.api.ApiMapper::batch).toList();
    }

    @Transactional(readOnly = true)
    public BatchView get(Long id) {
        ProductionBatch value = requireBatch(id);
        assertCanAccess(value);
        return batch(value);
    }

    @Transactional(readOnly = true)
    public BatchView trace(String code) {
        return batch(batchRepository.findByTraceabilityCode(code)
                .orElseThrow(() -> new NotFoundException("Traceability record not found.")));
    }

    @Transactional(readOnly = true)
    public List<StatusHistoryView> history(Long id) {
        ProductionBatch value = requireBatch(id);
        assertCanAccess(value);
        return historyRepository.findAllByBatchIdOrderByChangedAtAsc(id).stream()
                .map(com.stellana.mixing.api.ApiMapper::statusHistory).toList();
    }

    @Transactional
    public BatchView create(CreateBatchRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        if (batchRepository.existsByBatchNumberIgnoreCase(request.batchNumber())) {
            throw new BusinessRuleException("Batch number already exists.");
        }
        if (request.plannedQuantityKg().compareTo(mixerCapacityKg) > 0) {
            throw new BusinessRuleException("Planned quantity cannot exceed confirmed mixer capacity of "
                    + mixerCapacityKg + " kg. The unconfirmed fill factor is not used.");
        }
        RecipeRevision revision = recipeRevisionRepository.findById(request.recipeRevisionId())
                .orElseThrow(() -> new NotFoundException("Recipe revision not found."));
        if (revision.getStatus() != RecipeStatus.ACTIVE) {
            throw new BusinessRuleException("Only an active recipe revision can be assigned to a new batch.");
        }
        UserAccount officer;
        if (actor.getRole() == Role.MIXING_OFFICER) {
            if (request.assignedOfficerId() != null && !request.assignedOfficerId().equals(actor.getId())) {
                throw new BusinessRuleException("A Mixing Officer can create batches only for themselves.");
            }
            officer = actor;
        } else {
            if (request.assignedOfficerId() == null) {
                throw new BusinessRuleException("An assigned Mixing Officer is required.");
            }
            officer = userAccountRepository.findById(request.assignedOfficerId())
                    .filter(UserAccount::isActive)
                    .orElseThrow(() -> new NotFoundException("Assigned officer not found or inactive."));
        }
        if (officer.getRole() != Role.MIXING_OFFICER) {
            throw new BusinessRuleException("The assigned user must be a Mixing Officer.");
        }
        validateSchedulePair(request.plannedStartTime(), request.targetCompletionTime());
        boolean hasSchedule = request.plannedStartTime() != null;
        if (hasSchedule && !isManagerOrAdmin(actor)) {
            throw new BusinessRuleException("Only a Manager or System Administrator can schedule a batch.");
        }
        if (hasSchedule) {
            requireConflictConfirmation(null, officer, request.machine(), request.plannedStartTime(),
                    request.targetCompletionTime(), request.confirmScheduleConflicts(), request.scheduleConflictReason());
        }
        ProductionBatch source = request.reprocessingSourceBatchId() == null ? null
                : requireBatch(request.reprocessingSourceBatchId());
        ProductionBatch value = ProductionBatch.builder()
                .batchNumber(request.batchNumber().trim().toUpperCase())
                .recipeRevision(revision)
                .plannedQuantityKg(request.plannedQuantityKg())
                .machine(request.machine().trim())
                .assignedOfficer(officer)
                .plannedStartTime(request.plannedStartTime())
                .targetCompletionTime(request.targetCompletionTime())
                .productionPriority(request.productionPriority() == null
                        ? ProductionPriority.NORMAL : request.productionPriority())
                .scheduleNotes(trimToNull(request.scheduleNotes()))
                .scheduledBy(hasSchedule ? actor : null)
                .scheduledAt(hasSchedule ? LocalDateTime.now() : null)
                .status(BatchStatus.PLANNED)
                .traceabilityCode(UUID.randomUUID().toString())
                .reprocessingSourceBatch(source)
                .build();
        ProductionBatch saved = batchRepository.save(value);
        recordHistory(saved, null, BatchStatus.PLANNED, actor, "Batch created");
        auditService.record(actor, "CREATE_BATCH", "ProductionBatch", saved.getId(), null,
                saved.getBatchNumber() + " / " + revision.getRecipe().getRecipeCode() + " rev " + revision.getRevisionNumber()
                        + (hasSchedule ? " / " + scheduleDescription(saved) : "")
                        + (Boolean.TRUE.equals(request.confirmScheduleConflicts()) && StringUtils.hasText(request.scheduleConflictReason())
                        ? " / CONFLICT CONFIRMED: " + request.scheduleConflictReason().trim() : ""),
                saved.getId(), revision.getRecipe().getId());
        notificationService.notifyUser(officer, NotificationType.BATCH_CHANGED, "Batch assigned",
                saved.getBatchNumber() + " has been assigned to you"
                        + (hasSchedule ? " for " + saved.getPlannedStartTime() : "") + ".", "BATCH", saved.getId());
        realtimeEventService.dashboardChanged("BATCH_CREATED", saved.getId(), saved.getBatchNumber() + " created");
        return batch(saved);
    }

    @Transactional
    public BatchView schedule(Long id, ScheduleBatchRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        if (!isManagerOrAdmin(actor)) {
            throw new BusinessRuleException("Only a Manager or System Administrator can schedule a batch.");
        }
        ProductionBatch value = requireBatch(id);
        if (value.getStatus() == BatchStatus.CANCELLED || value.getStage2CompletedAt() != null) {
            throw new BusinessRuleException("A cancelled or completed batch cannot be rescheduled.");
        }
        if (value.getStage1StartedAt() != null) {
            throw new BusinessRuleException("This batch has already started. Its production schedule can no longer be reassigned.");
        }
        validateSchedulePair(request.plannedStartTime(), request.targetCompletionTime());
        UserAccount officer = userAccountRepository.findById(request.assignedOfficerId())
                .filter(UserAccount::isActive)
                .orElseThrow(() -> new NotFoundException("Assigned officer not found or inactive."));
        if (officer.getRole() != Role.MIXING_OFFICER) {
            throw new BusinessRuleException("The assigned user must be a Mixing Officer.");
        }
        requireConflictConfirmation(value.getId(), officer, request.machine(), request.plannedStartTime(),
                request.targetCompletionTime(), request.confirmScheduleConflicts(), request.scheduleConflictReason());

        String previous = scheduleDescription(value);
        value.setPlannedStartTime(request.plannedStartTime());
        value.setTargetCompletionTime(request.targetCompletionTime());
        value.setAssignedOfficer(officer);
        value.setMachine(request.machine().trim());
        value.setProductionPriority(request.productionPriority() == null
                ? ProductionPriority.NORMAL : request.productionPriority());
        value.setScheduleNotes(trimToNull(request.scheduleNotes()));
        value.setScheduledBy(actor);
        value.setScheduledAt(LocalDateTime.now());
        ProductionBatch saved = batchRepository.save(value);
        String next = scheduleDescription(saved)
                + (Boolean.TRUE.equals(request.confirmScheduleConflicts()) && StringUtils.hasText(request.scheduleConflictReason())
                ? " / CONFLICT CONFIRMED: " + request.scheduleConflictReason().trim() : "");
        auditService.record(actor, previous.equals("Unscheduled") ? "SCHEDULE_BATCH" : "RESCHEDULE_BATCH",
                "ProductionBatch", saved.getId(), previous, next,
                saved.getId(), saved.getRecipeRevision().getRecipe().getId());
        notificationService.notifyUser(officer, NotificationType.BATCH_CHANGED,
                previous.equals("Unscheduled") ? "Batch scheduled" : "Batch schedule updated",
                saved.getBatchNumber() + " is scheduled from " + saved.getPlannedStartTime()
                        + " to " + saved.getTargetCompletionTime() + ".", "BATCH", saved.getId());
        realtimeEventService.dashboardChanged("BATCH_SCHEDULE_CHANGED", saved.getId(),
                saved.getBatchNumber() + " schedule updated");
        return batch(saved);
    }

    @Transactional
    public BatchView transition(Long id, BatchTransitionRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        ProductionBatch value = requireBatch(id);
        assertCanAccess(value);
        BatchStatus previous = value.getStatus();
        BatchStatus target = request.status();
        if (previous == target) {
            return batch(value);
        }
        if (Set.of(BatchStatus.RELEASED_TO_BLANKING, BatchStatus.REPROCESSING, BatchStatus.CANCELLED).contains(target)
                && !List.of(Role.MANAGER, Role.SYSTEM_ADMIN).contains(actor.getRole())) {
            throw new BusinessRuleException("A Manager or System Administrator must approve this transition.");
        }
        if (!TRANSITIONS.getOrDefault(previous, Set.of()).contains(target)) {
            throw new BusinessRuleException("Invalid batch transition from " + previous + " to " + target + ".");
        }
        if ((target == BatchStatus.STOPPED || target == BatchStatus.CANCELLED || target == BatchStatus.ON_HOLD)
                && !StringUtils.hasText(request.reason())) {
            throw new BusinessRuleException("A reason is required for stopped, cancelled, or held batches.");
        }
        boolean temporaryLabBypass = target == BatchStatus.RELEASED_TO_BLANKING
                && value.getLaboratoryStatus() != LabDecision.PASS;
        if (temporaryLabBypass) {
            if (previous != BatchStatus.STAGE_2_COMPLETED
                    || value.getLaboratoryStatus() != LabDecision.PENDING) {
                throw new BusinessRuleException(
                        "Temporary release without laboratory sampling is allowed only immediately after Stage 2 completion.");
            }
            if (!Boolean.TRUE.equals(request.temporaryLabBypass())) {
                throw new BusinessRuleException(
                        "Confirm the temporary laboratory bypass before releasing this batch to Blanking.");
            }
            if (value.getStage2CompletedAt() == null) {
                throw new BusinessRuleException("Stage 2 must be completed before temporary release to Blanking.");
            }
            if (!StringUtils.hasText(request.reason())) {
                throw new BusinessRuleException("A reason is required for temporary release without laboratory sampling.");
            }
        }
        if (target == BatchStatus.REPROCESSING && value.getLaboratoryStatus() != LabDecision.FAIL) {
            throw new BusinessRuleException("Only a failed batch can be sent for reprocessing.");
        }
        value.setStatus(target);
        if (temporaryLabBypass) {
            value.setTemporaryLabBypass(true);
            value.setTemporaryLabBypassReason(request.reason().trim());
            value.setTemporaryLabBypassApprovedBy(actor);
            value.setTemporaryLabBypassApprovedAt(LocalDateTime.now());
        }
        if (StringUtils.hasText(request.reason())) {
            value.setIssueOrStoppageReason(request.reason().trim());
        }
        applyDecisionState(value, target);
        ProductionBatch saved = batchRepository.save(value);
        recordHistory(saved, previous, target, actor, request.reason());
        auditService.record(actor, "CHANGE_BATCH_STATUS", "ProductionBatch", saved.getId(),
                previous.name(), target.name() + (StringUtils.hasText(request.reason()) ? " — " + request.reason() : ""),
                saved.getId(), saved.getRecipeRevision().getRecipe().getId());
        if (temporaryLabBypass) {
            auditService.record(actor, "TEMPORARY_RELEASE_WITHOUT_LAB", "ProductionBatch", saved.getId(),
                    "Laboratory status " + saved.getLaboratoryStatus(),
                    "Released to Blanking without lab sampling — " + saved.getTemporaryLabBypassReason(),
                    saved.getId(), saved.getRecipeRevision().getRecipe().getId());
        }
        realtimeEventService.dashboardChanged("BATCH_STATUS_CHANGED", saved.getId(),
                saved.getBatchNumber() + " changed to " + target);
        if (target == BatchStatus.RELEASED_TO_BLANKING) {
            approvedMaterialService.createFromReleasedMixingBatch(saved, actor);
        }
        return batch(saved);
    }

    @Transactional
    public ProductionBatch transitionInternal(ProductionBatch value, BatchStatus target, UserAccount actor, String reason) {
        BatchStatus previous = value.getStatus();
        if (previous != target && !TRANSITIONS.getOrDefault(previous, Set.of()).contains(target)) {
            throw new BusinessRuleException("Invalid batch transition from " + previous + " to " + target + ".");
        }
        value.setStatus(target);
        applyDecisionState(value, target);
        ProductionBatch saved = batchRepository.save(value);
        if (previous != target) {
            recordHistory(saved, previous, target, actor, reason);
            auditService.record(actor, "CHANGE_BATCH_STATUS", "ProductionBatch", saved.getId(),
                    previous.name(), target.name(), saved.getId(), saved.getRecipeRevision().getRecipe().getId());
            realtimeEventService.dashboardChanged("BATCH_STATUS_CHANGED", saved.getId(),
                    saved.getBatchNumber() + " changed to " + target);
            if (target == BatchStatus.RELEASED_TO_BLANKING) {
                approvedMaterialService.createFromReleasedMixingBatch(saved, actor);
            }
        }
        return saved;
    }

    @Transactional
    public ProductionBatch overrideTransitionInternal(ProductionBatch value, BatchStatus target,
                                                      UserAccount actor, String reason) {
        BatchStatus previous = value.getStatus();
        value.setStatus(target);
        ProductionBatch saved = batchRepository.save(value);
        recordHistory(saved, previous, target, actor, "MANAGER OVERRIDE: " + reason);
        auditService.record(actor, "OVERRIDE_BATCH_STATUS", "ProductionBatch", saved.getId(),
                previous.name(), target.name() + " — " + reason,
                saved.getId(), saved.getRecipeRevision().getRecipe().getId());
        realtimeEventService.dashboardChanged("BATCH_STATUS_OVERRIDDEN", saved.getId(),
                saved.getBatchNumber() + " was overridden to " + target);
        return saved;
    }

    public ProductionBatch requireBatch(Long id) {
        return batchRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Batch not found."));
    }

    public void assertCanAccess(ProductionBatch batch) {
        UserAccount current = currentUserService.requireCurrentUser();
        if (current.getRole() == Role.MIXING_OFFICER
                && !batch.getAssignedOfficer().getId().equals(current.getId())) {
            throw new BusinessRuleException("This batch is not assigned to the current officer.");
        }
    }

    private void validateSchedulePair(LocalDateTime start, LocalDateTime target) {
        if ((start == null) != (target == null)) {
            throw new BusinessRuleException("Planned start and target completion time must be entered together.");
        }
        if (start != null && !target.isAfter(start)) {
            throw new BusinessRuleException("Target completion time must be after the planned start time.");
        }
    }

    private void requireConflictConfirmation(Long excludedBatchId, UserAccount officer, String machine,
                                             LocalDateTime start, LocalDateTime target,
                                             Boolean confirmed, String confirmationReason) {
        List<String> conflicts = batchRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(existing -> !Objects.equals(existing.getId(), excludedBatchId))
                .filter(existing -> existing.getPlannedStartTime() != null && existing.getTargetCompletionTime() != null)
                .filter(existing -> existing.getStage2CompletedAt() == null && existing.getStatus() != BatchStatus.CANCELLED)
                .filter(existing -> start.isBefore(existing.getTargetCompletionTime())
                        && target.isAfter(existing.getPlannedStartTime()))
                .filter(existing -> existing.getAssignedOfficer().getId().equals(officer.getId())
                        || existing.getMachine().equalsIgnoreCase(machine.trim()))
                .map(existing -> existing.getBatchNumber() + " ("
                        + existing.getPlannedStartTime() + " to " + existing.getTargetCompletionTime() + ")")
                .limit(5)
                .toList();
        if (conflicts.isEmpty()) {
            return;
        }
        String conflictMessage = "Schedule conflict with " + String.join(", ", conflicts) + ".";
        if (!Boolean.TRUE.equals(confirmed)) {
            throw new BusinessRuleException(conflictMessage + " Confirm the conflict and provide a reason to continue.");
        }
        if (!StringUtils.hasText(confirmationReason)) {
            throw new BusinessRuleException(conflictMessage + " A confirmation reason is required.");
        }
    }

    private boolean isManagerOrAdmin(UserAccount user) {
        return List.of(Role.MANAGER, Role.SYSTEM_ADMIN).contains(user.getRole());
    }

    private String scheduleDescription(ProductionBatch value) {
        if (value.getPlannedStartTime() == null || value.getTargetCompletionTime() == null) {
            return "Unscheduled";
        }
        return value.getPlannedStartTime() + " to " + value.getTargetCompletionTime()
                + " / " + value.getMachine() + " / " + value.getAssignedOfficer().getFullName()
                + " / " + (value.getProductionPriority() == null ? ProductionPriority.NORMAL : value.getProductionPriority());
    }

    private String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private void recordHistory(ProductionBatch batch, BatchStatus previous, BatchStatus target,
                               UserAccount actor, String reason) {
        historyRepository.save(BatchStatusHistory.builder()
                .batch(batch)
                .previousStatus(previous)
                .newStatus(target)
                .changedBy(actor)
                .changedAt(LocalDateTime.now())
                .reason(reason)
                .build());
    }

    private void applyDecisionState(ProductionBatch value, BatchStatus target) {
        switch (target) {
            case LAB_PASSED -> {
                value.setLaboratoryStatus(LabDecision.PASS);
                value.setReleaseStatus(ReleaseStatus.PENDING_APPROVAL);
            }
            case LAB_FAILED -> {
                value.setLaboratoryStatus(LabDecision.FAIL);
                value.setReleaseStatus(ReleaseStatus.REPROCESSING_REQUIRED);
            }
            case ON_HOLD -> {
                value.setLaboratoryStatus(LabDecision.HOLD);
                value.setReleaseStatus(ReleaseStatus.BLOCKED);
            }
            case RETEST_REQUIRED -> {
                value.setLaboratoryStatus(LabDecision.RETEST);
                value.setReleaseStatus(ReleaseStatus.BLOCKED);
            }
            case RELEASED_TO_BLANKING -> value.setReleaseStatus(ReleaseStatus.APPROVED_FOR_BLANKING);
            case REPROCESSING -> value.setReleaseStatus(ReleaseStatus.REPROCESSING_REQUIRED);
            default -> { }
        }
    }

    private static Map<BatchStatus, Set<BatchStatus>> buildTransitions() {
        Map<BatchStatus, Set<BatchStatus>> map = new EnumMap<>(BatchStatus.class);
        map.put(BatchStatus.PLANNED, Set.of(BatchStatus.WAITING_FOR_MATERIALS, BatchStatus.READY_FOR_STAGE_1, BatchStatus.CANCELLED));
        map.put(BatchStatus.WAITING_FOR_MATERIALS, Set.of(BatchStatus.MATERIALS_REQUESTED, BatchStatus.CANCELLED, BatchStatus.STOPPED));
        map.put(BatchStatus.MATERIALS_REQUESTED, Set.of(BatchStatus.MATERIALS_ISSUED, BatchStatus.CANCELLED, BatchStatus.STOPPED));
        map.put(BatchStatus.MATERIALS_ISSUED, Set.of(BatchStatus.READY_FOR_STAGE_1, BatchStatus.STOPPED));
        map.put(BatchStatus.READY_FOR_STAGE_1, Set.of(BatchStatus.STAGE_1_IN_PROGRESS, BatchStatus.STOPPED, BatchStatus.CANCELLED));
        map.put(BatchStatus.STAGE_1_IN_PROGRESS, Set.of(BatchStatus.STAGE_1_COMPLETED, BatchStatus.STOPPED));
        map.put(BatchStatus.STAGE_1_COMPLETED, Set.of(BatchStatus.READY_FOR_STAGE_2, BatchStatus.STAGE_2_IN_PROGRESS, BatchStatus.STOPPED));
        map.put(BatchStatus.READY_FOR_STAGE_2, Set.of(BatchStatus.STAGE_2_IN_PROGRESS, BatchStatus.STOPPED));
        map.put(BatchStatus.STAGE_2_IN_PROGRESS, Set.of(BatchStatus.STAGE_2_COMPLETED, BatchStatus.STOPPED));
        map.put(BatchStatus.STAGE_2_COMPLETED, Set.of(
                BatchStatus.SAMPLE_SENT_TO_LAB, BatchStatus.RELEASED_TO_BLANKING, BatchStatus.STOPPED));
        map.put(BatchStatus.SAMPLE_SENT_TO_LAB, Set.of(BatchStatus.WAITING_FOR_LAB));
        map.put(BatchStatus.WAITING_FOR_LAB, Set.of(BatchStatus.LAB_PASSED, BatchStatus.LAB_FAILED, BatchStatus.ON_HOLD, BatchStatus.RETEST_REQUIRED));
        map.put(BatchStatus.LAB_PASSED, Set.of(BatchStatus.RELEASED_TO_BLANKING, BatchStatus.ON_HOLD));
        map.put(BatchStatus.LAB_FAILED, Set.of(BatchStatus.REPROCESSING, BatchStatus.ON_HOLD, BatchStatus.RETEST_REQUIRED));
        map.put(BatchStatus.ON_HOLD, Set.of(BatchStatus.WAITING_FOR_LAB, BatchStatus.LAB_PASSED, BatchStatus.LAB_FAILED, BatchStatus.RETEST_REQUIRED, BatchStatus.STOPPED));
        map.put(BatchStatus.RETEST_REQUIRED, Set.of(BatchStatus.SAMPLE_SENT_TO_LAB, BatchStatus.WAITING_FOR_LAB));
        map.put(BatchStatus.STOPPED, Set.of(BatchStatus.READY_FOR_STAGE_1, BatchStatus.READY_FOR_STAGE_2, BatchStatus.WAITING_FOR_LAB, BatchStatus.CANCELLED));
        return Collections.unmodifiableMap(map);
    }
}

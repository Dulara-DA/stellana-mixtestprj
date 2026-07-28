package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.MixingStageRepository;
import com.stellana.mixing.repository.ProductionBatchRepository;
import com.stellana.mixing.repository.StagePauseEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

import static com.stellana.mixing.api.ApiMapper.stage;

@Service
@RequiredArgsConstructor
public class MixingStageService {
    private final MixingStageRepository stageRepository;
    private final StagePauseEventRepository pauseEventRepository;
    private final ProductionBatchRepository batchRepository;
    private final BatchService batchService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;
    private final RealtimeEventService realtimeEventService;

    @Transactional(readOnly = true)
    public List<StageView> forBatch(Long batchId) {
        batchService.assertCanAccess(batchService.requireBatch(batchId));
        return stageRepository.findAllByBatchIdOrderByStageNumberAsc(batchId).stream()
                .map(com.stellana.mixing.api.ApiMapper::stage).toList();
    }

    @Transactional
    public StageView start(StartStageRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        ProductionBatch batch = batchService.requireBatch(request.batchId());
        if (actor.getRole() == Role.MIXING_OFFICER
                && !batch.getAssignedOfficer().getId().equals(actor.getId())) {
            throw new BusinessRuleException("Only the assigned officer can start this stage.");
        }
        if (stageRepository.findByBatchIdAndStageNumber(batch.getId(), request.stageNumber()).isPresent()) {
            throw new BusinessRuleException("This mixing stage has already been created.");
        }

        boolean override = Boolean.TRUE.equals(request.managerOverride());
        LocalDateTime inTime = LocalDateTime.now();
        if (request.stageNumber() == 1) {
            if (batch.getStatus() == BatchStatus.MATERIALS_ISSUED) {
                batch = batchService.transitionInternal(batch, BatchStatus.READY_FOR_STAGE_1, actor, "Materials ready");
            }
            if (batch.getStatus() != BatchStatus.READY_FOR_STAGE_1) {
                throw new BusinessRuleException("Stage 1 can start only when the batch is ready for Stage 1.");
            }
            batch = batchService.transitionInternal(batch, BatchStatus.STAGE_1_IN_PROGRESS, actor,
                    "Stage 1 IN recorded");
            batch.setCurrentStage(1);
            batch.setStage1StartedAt(inTime);
        } else {
            boolean stageOneCompleted = stageRepository.findByBatchIdAndStageNumber(batch.getId(), 1)
                    .map(stage -> stage.getCompletionStatus() == StageCompletionStatus.COMPLETED
                            || stage.getCompletionStatus() == StageCompletionStatus.OVERRIDDEN)
                    .orElse(false);
            if (!stageOneCompleted) {
                if (!override || !List.of(Role.MANAGER, Role.SYSTEM_ADMIN).contains(actor.getRole())
                        || !StringUtils.hasText(request.overrideReason())) {
                    throw new BusinessRuleException("Stage 1 must be completed before Stage 2. A Manager override requires a reason.");
                }
                batch = batchService.overrideTransitionInternal(batch, BatchStatus.STAGE_2_IN_PROGRESS,
                        actor, request.overrideReason());
            } else {
                if (batch.getStatus() == BatchStatus.STAGE_1_COMPLETED) {
                    batch = batchService.transitionInternal(batch, BatchStatus.READY_FOR_STAGE_2, actor, "Stage 2 ready");
                }
                if (batch.getStatus() != BatchStatus.READY_FOR_STAGE_2) {
                    throw new BusinessRuleException("Stage 2 can start only when the batch is ready for Stage 2.");
                }
                batch = batchService.transitionInternal(batch, BatchStatus.STAGE_2_IN_PROGRESS, actor,
                        "Stage 2 IN recorded for sulphur addition");
            }
            batch.setCurrentStage(2);
            batch.setStage2StartedAt(inTime);
        }
        batchRepository.save(batch);

        MixingStage value = MixingStage.builder()
                .batch(batch)
                .stageNumber(request.stageNumber())
                .startTime(inTime)
                .officer(actor)
                .machine(StringUtils.hasText(request.machine()) ? request.machine().trim() : batch.getMachine())
                .plannedQuantity(batch.getPlannedQuantityKg())
                .completionStatus(StageCompletionStatus.IN_PROGRESS)
                .managerOverride(override)
                .overrideReason(request.overrideReason())
                .build();
        MixingStage saved = stageRepository.save(value);
        auditService.record(actor, "START_MIXING_STAGE", "MixingStage", saved.getId(), null,
                "Stage " + saved.getStageNumber(), batch.getId(), batch.getRecipeRevision().getRecipe().getId());
        realtimeEventService.dashboardChanged("STAGE_STARTED", batch.getId(),
                batch.getBatchNumber() + " Stage " + request.stageNumber() + " started");
        return stage(saved);
    }

    @Transactional
    public StageView pause(Long stageId, PauseStageRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        MixingStage value = requireStage(stageId);
        assertStageActor(value, actor);
        if (value.getCompletionStatus() != StageCompletionStatus.IN_PROGRESS) {
            throw new BusinessRuleException("Only an in-progress stage can be paused.");
        }
        StagePauseEvent pause = StagePauseEvent.builder()
                .mixingStage(value)
                .pausedAt(LocalDateTime.now())
                .reason(request.reason())
                .recordedBy(actor)
                .build();
        pauseEventRepository.save(pause);
        value.getPauseEvents().add(pause);
        value.setCompletionStatus(StageCompletionStatus.PAUSED);
        stageRepository.save(value);
        auditService.record(actor, "PAUSE_MIXING_STAGE", "MixingStage", value.getId(),
                StageCompletionStatus.IN_PROGRESS.name(), request.reason(),
                value.getBatch().getId(), value.getBatch().getRecipeRevision().getRecipe().getId());
        realtimeEventService.dashboardChanged("STAGE_PAUSED", value.getBatch().getId(),
                value.getBatch().getBatchNumber() + " paused");
        return stage(value);
    }

    @Transactional
    public StageView resume(Long stageId) {
        UserAccount actor = currentUserService.requireCurrentUser();
        MixingStage value = requireStage(stageId);
        assertStageActor(value, actor);
        if (value.getCompletionStatus() != StageCompletionStatus.PAUSED) {
            throw new BusinessRuleException("Only a paused stage can be resumed.");
        }
        StagePauseEvent pause = pauseEventRepository
                .findFirstByMixingStageIdAndResumedAtIsNullOrderByPausedAtDesc(stageId)
                .orElseThrow(() -> new BusinessRuleException("Open pause event was not found."));
        pause.setResumedAt(LocalDateTime.now());
        pauseEventRepository.save(pause);
        value.setCompletionStatus(StageCompletionStatus.IN_PROGRESS);
        stageRepository.save(value);
        auditService.record(actor, "RESUME_MIXING_STAGE", "MixingStage", value.getId(),
                StageCompletionStatus.PAUSED.name(), StageCompletionStatus.IN_PROGRESS.name(),
                value.getBatch().getId(), value.getBatch().getRecipeRevision().getRecipe().getId());
        realtimeEventService.dashboardChanged("STAGE_RESUMED", value.getBatch().getId(),
                value.getBatch().getBatchNumber() + " resumed");
        return stage(value);
    }

    @Transactional
    public StageView complete(Long stageId, StageCompleteRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        MixingStage value = requireStage(stageId);
        assertStageActor(value, actor);
        if (value.getCompletionStatus() != StageCompletionStatus.IN_PROGRESS) {
            throw new BusinessRuleException("Resume the stage before completing it.");
        }
        value.setEndTime(LocalDateTime.now());
        value.setActualQuantity(request.actualQuantity());
        value.setTemperatureCelsius(request.temperatureCelsius());
        value.setMixingTimeSeconds(request.mixingTimeSeconds());
        value.setSpeedRpm(request.speedRpm());
        value.setNotes(request.notes());
        value.setCompletionStatus(value.isManagerOverride()
                ? StageCompletionStatus.OVERRIDDEN : StageCompletionStatus.COMPLETED);
        MixingStage saved = stageRepository.save(value);
        ProductionBatch batch = value.getBatch();
        if (value.getStageNumber() == 1) {
            batch.setStage1CompletedAt(value.getEndTime());
            batch = batchService.transitionInternal(batch, BatchStatus.STAGE_1_COMPLETED, actor,
                    "Stage 1 OUT recorded");
            batchService.transitionInternal(batch, BatchStatus.READY_FOR_STAGE_2, actor,
                    "Stage 1 completed and batch issued to Stage 2 for sulphur addition");
        } else {
            batch.setStage2CompletedAt(value.getEndTime());
            batch.setActualOutputQuantityKg(request.actualQuantity());
            batchService.transitionInternal(batch, BatchStatus.STAGE_2_COMPLETED, actor,
                    "Stage 2 OUT recorded");
        }
        auditService.record(actor, "COMPLETE_MIXING_STAGE", "MixingStage", saved.getId(),
                StageCompletionStatus.IN_PROGRESS.name(), saved.getCompletionStatus().name(),
                batch.getId(), batch.getRecipeRevision().getRecipe().getId());
        realtimeEventService.dashboardChanged("STAGE_COMPLETED", batch.getId(),
                batch.getBatchNumber() + " Stage " + value.getStageNumber() + " completed");
        return stage(saved);
    }

    private MixingStage requireStage(Long id) {
        return stageRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Mixing stage not found."));
    }

    private void assertStageActor(MixingStage stage, UserAccount actor) {
        if (actor.getRole() == Role.MIXING_OFFICER
                && !stage.getBatch().getAssignedOfficer().getId().equals(actor.getId())) {
            throw new BusinessRuleException("Only the assigned officer can update this mixing stage.");
        }
    }
}

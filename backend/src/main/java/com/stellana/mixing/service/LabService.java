package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.LabSampleRepository;
import com.stellana.mixing.repository.RecipeRepository;
import com.stellana.mixing.repository.TestSpecificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

import static com.stellana.mixing.api.ApiMapper.labSample;

@Service
@RequiredArgsConstructor
public class LabService {
    private final LabSampleRepository sampleRepository;
    private final TestSpecificationRepository specificationRepository;
    private final RecipeRepository recipeRepository;
    private final BatchService batchService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;
    private final NotificationService notificationService;
    private final RealtimeEventService realtimeEventService;

    @Transactional(readOnly = true)
    public List<LabSampleView> list() {
        return sampleRepository.findAllByOrderBySentToLabAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::labSample).toList();
    }

    @Transactional
    public LabSampleView sendSample(Long batchId) {
        UserAccount actor = currentUserService.requireCurrentUser();
        ProductionBatch batch = batchService.requireBatch(batchId);
        batchService.assertCanAccess(batch);
        if (!List.of(BatchStatus.STAGE_2_COMPLETED, BatchStatus.RETEST_REQUIRED).contains(batch.getStatus())) {
            throw new BusinessRuleException("A sample can be sent only after Stage 2 or when a retest is required.");
        }
        LabSample sample = LabSample.builder()
                .sampleId("SMP-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS")))
                .batch(batch)
                .sentToLabAt(LocalDateTime.now())
                .decision(LabDecision.PENDING)
                .build();
        LabSample saved = sampleRepository.save(sample);
        batch = batchService.transitionInternal(batch, BatchStatus.SAMPLE_SENT_TO_LAB, actor, saved.getSampleId());
        batchService.transitionInternal(batch, BatchStatus.WAITING_FOR_LAB, actor, "Sample received in lab queue");
        auditService.record(actor, "SEND_SAMPLE_TO_LAB", "LabSample", saved.getId(), null,
                saved.getSampleId(), batch.getId(), batch.getRecipeRevision().getRecipe().getId());
        notificationService.notifyRole(Role.MANAGER, NotificationType.BATCH_CHANGED, "Sample waiting for lab",
                saved.getSampleId() + " from " + batch.getBatchNumber(), "LAB_SAMPLE", saved.getId());
        realtimeEventService.dashboardChanged("SAMPLE_SENT", batch.getId(),
                saved.getSampleId() + " sent to lab");
        return labSample(saved);
    }

    @Transactional
    public LabSampleView recordResult(Long sampleId, LabResultRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        LabSample sample = sampleRepository.findById(sampleId)
                .orElseThrow(() -> new NotFoundException("Laboratory sample not found."));
        if (request.decision() == LabDecision.PENDING) {
            throw new BusinessRuleException("Select Pass, Fail, Hold, or Retest.");
        }
        sample.setTestDateTime(LocalDateTime.now());
        sample.setHardness(request.hardness());
        sample.setResilience(request.resilience());
        sample.setCuringTimeMinutes(request.curingTimeMinutes());
        sample.setDecision(request.decision());
        sample.setTestedBy(actor);
        sample.setComments(request.comments());
        sample.setReprocessingDecision(Boolean.TRUE.equals(request.reprocessingDecision()));
        sample.setManagerApprovedBy(actor);
        sample.setManagerApprovedAt(LocalDateTime.now());
        sample.getAdditionalResults().clear();
        if (request.additionalResults() != null) {
            request.additionalResults().forEach(result -> sample.addResult(LabTestResult.builder()
                    .testName(result.testName())
                    .resultValue(result.resultValue())
                    .unit(result.unit())
                    .build()));
        }
        LabSample saved = sampleRepository.save(sample);
        ProductionBatch batch = sample.getBatch();
        BatchStatus target = switch (request.decision()) {
            case PASS -> BatchStatus.LAB_PASSED;
            case FAIL -> BatchStatus.LAB_FAILED;
            case HOLD -> BatchStatus.ON_HOLD;
            case RETEST -> BatchStatus.RETEST_REQUIRED;
            default -> throw new BusinessRuleException("Unsupported laboratory decision.");
        };
        batch = batchService.transitionInternal(batch, target, actor, "Lab decision " + request.decision());
        if (request.decision() == LabDecision.FAIL && Boolean.TRUE.equals(request.reprocessingDecision())) {
            batchService.transitionInternal(batch, BatchStatus.REPROCESSING, actor, "Reprocessing approved with lab result");
        }
        auditService.record(actor, "RECORD_LAB_RESULT", "LabSample", saved.getId(), LabDecision.PENDING.name(),
                request.decision().name(), batch.getId(), batch.getRecipeRevision().getRecipe().getId());
        notificationService.notifyUser(batch.getAssignedOfficer(), NotificationType.LAB_DECISION,
                "Laboratory decision: " + request.decision(),
                batch.getBatchNumber() + " result was recorded.", "LAB_SAMPLE", saved.getId());
        realtimeEventService.dashboardChanged("LAB_RESULT_RECORDED", batch.getId(),
                batch.getBatchNumber() + " — " + request.decision());
        return labSample(saved);
    }

    @Transactional(readOnly = true)
    public List<TestSpecificationView> specifications() {
        return specificationRepository.findAllByActiveTrueOrderByTestNameAsc().stream()
                .map(value -> new TestSpecificationView(value.getId(),
                        value.getRecipe() == null ? null : value.getRecipe().getId(),
                        value.getRecipe() == null ? null : value.getRecipe().getRecipeCode(),
                        value.getTestName(), value.getMinimumValue(), value.getMaximumValue(), value.getUnit(),
                        value.getNotes(), value.isActive()))
                .toList();
    }

    @Transactional
    public TestSpecificationView createSpecification(TestSpecificationRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        Recipe recipe = request.recipeId() == null ? null : recipeRepository.findById(request.recipeId())
                .orElseThrow(() -> new NotFoundException("Recipe not found."));
        TestSpecification saved = specificationRepository.save(TestSpecification.builder()
                .recipe(recipe)
                .testName(request.testName().trim())
                .minimumValue(request.minimumValue())
                .maximumValue(request.maximumValue())
                .unit(request.unit())
                .notes(request.notes())
                .build());
        auditService.record(actor, "CREATE_TEST_SPECIFICATION", "TestSpecification", saved.getId(), null,
                saved.getTestName(), null, recipe == null ? null : recipe.getId());
        return new TestSpecificationView(saved.getId(), recipe == null ? null : recipe.getId(),
                recipe == null ? null : recipe.getRecipeCode(), saved.getTestName(), saved.getMinimumValue(),
                saved.getMaximumValue(), saved.getUnit(), saved.getNotes(), saved.isActive());
    }
}

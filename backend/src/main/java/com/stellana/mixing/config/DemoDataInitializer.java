package com.stellana.mixing.config;

import com.stellana.mixing.domain.*;
import com.stellana.mixing.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Configuration
@RequiredArgsConstructor
public class DemoDataInitializer implements CommandLineRunner {
    private final UserAccountRepository userRepository;
    private final RecipeRepository recipeRepository;
    private final RecipeRevisionRepository revisionRepository;
    private final ProductionBatchRepository batchRepository;
    private final BatchStatusHistoryRepository historyRepository;
    private final MixingStageRepository stageRepository;
    private final LabSampleRepository sampleRepository;
    private final MaterialRequestRepository materialRequestRepository;
    private final IssueThreadRepository issueRepository;
    private final TestSpecificationRepository specificationRepository;
    private final AuditLogRepository auditLogRepository;
    @Override
    @Transactional
    public void run(String... args) {
        if (userRepository.count() > 0) {
            return;
        }

        UserAccount manager = userRepository.save(UserAccount.builder()
                .fullName("Nadeesha Perera")
                .email("manager@stellana.local")
                .passwordHash("$2y$10$QWnKd6iWXK5FoT0ixYbMRuDwllMm/iaJfB3PafkBKLuy0UG1HD0JC")
                .role(Role.MANAGER)
                .active(true)
                .build());
        UserAccount officer = userRepository.save(UserAccount.builder()
                .fullName("Kasun Silva")
                .email("officer@stellana.local")
                .passwordHash("$2y$10$9igLjj71RbiOVxSZlS.IIeXy5oKsiqNrHefbIgWSz326ExgVnDFcC")
                .role(Role.MIXING_OFFICER)
                .active(true)
                .build());
        UserAccount admin = userRepository.save(UserAccount.builder()
                .fullName("System Administrator")
                .email("admin@stellana.local")
                .passwordHash("$2y$10$8WMog1yIfPKC17s9Qnmn2.GXIWIRhM9ZCA63RUq82fQMFklovFUle")
                .role(Role.SYSTEM_ADMIN)
                .active(true)
                .build());

        Recipe carbon = recipeRepository.save(Recipe.builder()
                .recipeCode("CB-101")
                .compoundName("Carbon Black Tread Compound")
                .build());
        RecipeRevision carbonR1 = RecipeRevision.builder()
                .recipe(carbon)
                .revisionNumber("1")
                .effectiveDate(LocalDate.now().minusMonths(8))
                .status(RecipeStatus.OBSOLETE)
                .createdBy(manager)
                .approvedBy(manager)
                .approvedAt(LocalDateTime.now().minusMonths(8))
                .revisionNotes("Initial digitized reference revision.")
                .build();
        addCarbonIngredients(carbonR1, new BigDecimal("90.000"), new BigDecimal("36.000"));
        revisionRepository.save(carbonR1);

        RecipeRevision carbonR2 = RecipeRevision.builder()
                .recipe(carbon)
                .revisionNumber("2")
                .effectiveDate(LocalDate.now().minusMonths(2))
                .status(RecipeStatus.ACTIVE)
                .createdBy(manager)
                .approvedBy(manager)
                .approvedAt(LocalDateTime.now().minusMonths(2))
                .revisionNotes("Updated process instructions. Production values remain subject to factory verification.")
                .build();
        addCarbonIngredients(carbonR2, new BigDecimal("92.000"), new BigDecimal("35.000"));
        revisionRepository.save(carbonR2);

        Recipe silica = recipeRepository.save(Recipe.builder()
                .recipeCode("SC-220")
                .compoundName("Silica Sidewall Compound")
                .build());
        RecipeRevision silicaR1 = RecipeRevision.builder()
                .recipe(silica)
                .revisionNumber("1")
                .effectiveDate(LocalDate.now().minusMonths(1))
                .status(RecipeStatus.ACTIVE)
                .createdBy(manager)
                .approvedBy(manager)
                .approvedAt(LocalDateTime.now().minusMonths(1))
                .revisionNotes("Prototype demonstration recipe. Parameters are TBC.")
                .build();
        silicaR1.addIngredient(ingredient("RM-010", "Natural Rubber", "105.000", "kg", 1, 1,
                "Add to Stage 1 according to the approved shop-floor instruction."));
        silicaR1.addIngredient(ingredient("RM-220", "Silica", "42.000", "kg", 2, 1,
                "Addition method TBC."));
        silicaR1.addIngredient(ingredient("RM-330", "Sulphur", "3.100", "kg", 3, 2,
                "Stage 2 addition; parameters TBC."));
        revisionRepository.save(silicaR1);

        ProductionBatch activeBatch = saveBatch("MX-260723-01", carbonR2, officer, BatchStatus.STAGE_1_IN_PROGRESS,
                1, "Mixer A", "220.000", LabDecision.PENDING, ReleaseStatus.NOT_READY);
        activeBatch.setStage1StartedAt(LocalDateTime.now().minusMinutes(18));
        batchRepository.save(activeBatch);
        stageRepository.save(MixingStage.builder()
                .batch(activeBatch).stageNumber(1).startTime(activeBatch.getStage1StartedAt()).officer(officer)
                .machine("Mixer A").plannedQuantity(new BigDecimal("220.000"))
                .completionStatus(StageCompletionStatus.IN_PROGRESS).notes("Demo active Stage 1 run").build());

        ProductionBatch waitingLab = saveBatch("MX-260723-02", silicaR1, officer, BatchStatus.WAITING_FOR_LAB,
                2, "Mixer B", "180.000", LabDecision.PENDING, ReleaseStatus.NOT_READY);
        seedCompletedStages(waitingLab, officer);
        sampleRepository.save(LabSample.builder()
                .sampleId("SMP-DEMO-002").batch(waitingLab)
                .sentToLabAt(LocalDateTime.now().minusMinutes(35)).decision(LabDecision.PENDING).build());

        ProductionBatch passed = saveBatch("MX-260722-07", carbonR2, officer, BatchStatus.LAB_PASSED,
                2, "Mixer A", "210.000", LabDecision.PASS, ReleaseStatus.PENDING_APPROVAL);
        seedCompletedStages(passed, officer);
        passed.setActualOutputQuantityKg(new BigDecimal("208.500"));
        batchRepository.save(passed);
        LabSample passedSample = LabSample.builder()
                .sampleId("SMP-DEMO-PASS").batch(passed).sentToLabAt(LocalDateTime.now().minusHours(5))
                .testDateTime(LocalDateTime.now().minusHours(4)).hardness(new BigDecimal("67.0"))
                .resilience(new BigDecimal("48.5")).curingTimeMinutes(new BigDecimal("6.8"))
                .decision(LabDecision.PASS).testedBy(manager).managerApprovedBy(manager)
                .managerApprovedAt(LocalDateTime.now().minusHours(4))
                .comments("Demonstration pass result; values do not define acceptance limits.").build();
        passedSample.addResult(LabTestResult.builder()
                .testName("Specific Gravity").resultValue("1.14").unit("g/cm³").build());
        sampleRepository.save(passedSample);

        ProductionBatch failed = saveBatch("MX-260722-04", carbonR2, officer, BatchStatus.REPROCESSING,
                2, "Mixer A", "205.000", LabDecision.FAIL, ReleaseStatus.REPROCESSING_REQUIRED);
        seedCompletedStages(failed, officer);
        failed.setActualOutputQuantityKg(new BigDecimal("203.700"));
        batchRepository.save(failed);
        sampleRepository.save(LabSample.builder()
                .sampleId("SMP-DEMO-FAIL").batch(failed).sentToLabAt(LocalDateTime.now().minusDays(1))
                .testDateTime(LocalDateTime.now().minusHours(20)).hardness(new BigDecimal("59.0"))
                .resilience(new BigDecimal("39.0")).curingTimeMinutes(new BigDecimal("8.2"))
                .decision(LabDecision.FAIL).testedBy(manager).reprocessingDecision(true)
                .managerApprovedBy(manager).managerApprovedAt(LocalDateTime.now().minusHours(19))
                .comments("Demonstration failed decision; sent for reprocessing. No limits are inferred.").build());

        ProductionBatch materialsBatch = saveBatch("MX-260723-03", silicaR1, officer, BatchStatus.MATERIALS_REQUESTED,
                0, "Mixer B", "175.000", LabDecision.PENDING, ReleaseStatus.NOT_READY);
        MaterialRequest materialRequest = MaterialRequest.builder()
                .requestNumber("MR-DEMO-001").batch(materialsBatch).requestingOfficer(officer)
                .requestedAt(LocalDateTime.now().minusMinutes(25)).status(MaterialRequestStatus.REQUESTED)
                .notes("Please prepare for the next scheduled run.").build();
        silicaR1.getIngredients().forEach(i -> materialRequest.addItem(MaterialRequestItem.builder()
                .materialCode(i.getMaterialCode()).materialName(i.getMaterialName())
                .requiredQuantity(i.getRequiredQuantity()).requestedQuantity(i.getRequiredQuantity())
                .issuedQuantity(BigDecimal.ZERO).unit(i.getUnit()).build()));
        materialRequestRepository.save(materialRequest);

        IssueThread issue = IssueThread.builder()
                .batch(activeBatch).priority(IssuePriority.HIGH)
                .subject("Temperature display fluctuating")
                .status(IssueStatus.ACKNOWLEDGED).createdBy(officer).assignedManager(manager)
                .unreadByManager(false).unreadByOfficer(true).build();
        issue.addMessage(IssueMessage.builder().sender(officer)
                .message("The mixer temperature display is fluctuating. Production is continuing under observation.").build());
        issue.addMessage(IssueMessage.builder().sender(manager)
                .message("Acknowledged. Record the readings and stop the batch if the display becomes unreliable. Maintenance has been informed.").build());
        issueRepository.save(issue);

        specificationRepository.save(TestSpecification.builder()
                .recipe(carbon).testName("Hardness").unit("Shore A")
                .notes("TBC — acceptable minimum and maximum have not been confirmed.").active(true).build());
        specificationRepository.save(TestSpecification.builder()
                .recipe(carbon).testName("Resilience").unit("%")
                .notes("TBC — acceptable minimum and maximum have not been confirmed.").active(true).build());

        for (ProductionBatch batch : new ProductionBatch[]{activeBatch, waitingLab, passed, failed, materialsBatch}) {
            historyRepository.save(BatchStatusHistory.builder()
                    .batch(batch).previousStatus(null).newStatus(BatchStatus.PLANNED)
                    .changedBy(manager).changedAt(batch.getCreatedAt() == null ? LocalDateTime.now().minusDays(1) : batch.getCreatedAt())
                    .reason("Demo batch created").build());
            if (batch.getStatus() != BatchStatus.PLANNED) {
                historyRepository.save(BatchStatusHistory.builder()
                        .batch(batch).previousStatus(BatchStatus.PLANNED).newStatus(batch.getStatus())
                        .changedBy(manager).changedAt(LocalDateTime.now().minusMinutes(10))
                        .reason("Demo data prepared at this workflow point").build());
            }
        }

        auditLogRepository.save(AuditLog.builder()
                .actor(admin).action("INITIALIZE_DEMO_DATA").entityType("System").entityId(null)
                .previousValue(null).newValue("Prototype demonstration records created")
                .actionTime(LocalDateTime.now()).build());
    }

    private RecipeIngredient ingredient(String code, String name, String quantity, String unit,
                                        int sequence, int stage, String instructions) {
        return RecipeIngredient.builder()
                .materialCode(code).materialName(name).requiredQuantity(new BigDecimal(quantity))
                .unit(unit).additionSequence(sequence).stageNumber(stage)
                .instructions(instructions).build();
    }

    private void addCarbonIngredients(RecipeRevision revision, BigDecimal rubber, BigDecimal carbonBlack) {
        revision.addIngredient(ingredient("RM-001", "Natural Rubber", rubber.toPlainString(), "kg", 1, 1,
                "Stage 1 addition sequence. Time, speed, and temperature are TBC."));
        revision.addIngredient(ingredient("RM-101", "Carbon Black", carbonBlack.toPlainString(), "kg", 2, 1,
                "Stage 1 addition sequence. Dust-control procedure applies."));
        revision.addIngredient(ingredient("RM-310", "Processing Oil", "8.500", "kg", 3, 1,
                "Addition sequence TBC."));
        revision.addIngredient(ingredient("RM-330", "Sulphur", "3.200", "kg", 4, 2,
                "Stage 2 addition; follow the approved shop-floor instruction."));
        revision.addIngredient(ingredient("RM-340", "Accelerator", "1.800", "kg", 5, 2,
                "Stage 2 addition sequence."));
    }

    private ProductionBatch saveBatch(String number, RecipeRevision revision, UserAccount officer,
                                      BatchStatus status, int currentStage, String machine, String quantity,
                                      LabDecision labDecision, ReleaseStatus releaseStatus) {
        return batchRepository.save(ProductionBatch.builder()
                .batchNumber(number).recipeRevision(revision).plannedQuantityKg(new BigDecimal(quantity))
                .machine(machine).assignedOfficer(officer).status(status).currentStage(currentStage)
                .laboratoryStatus(labDecision).releaseStatus(releaseStatus)
                .traceabilityCode(UUID.randomUUID().toString()).build());
    }

    private void seedCompletedStages(ProductionBatch batch, UserAccount officer) {
        LocalDateTime stage1Start = LocalDateTime.now().minusHours(3);
        LocalDateTime stage1End = stage1Start.plusMinutes(28);
        LocalDateTime stage2Start = stage1End.plusMinutes(20);
        LocalDateTime stage2End = stage2Start.plusMinutes(18);
        batch.setStage1StartedAt(stage1Start);
        batch.setStage1CompletedAt(stage1End);
        batch.setStage2StartedAt(stage2Start);
        batch.setStage2CompletedAt(stage2End);
        batchRepository.save(batch);
        stageRepository.save(MixingStage.builder()
                .batch(batch).stageNumber(1).startTime(stage1Start).endTime(stage1End).officer(officer)
                .machine(batch.getMachine()).plannedQuantity(batch.getPlannedQuantityKg())
                .actualQuantity(batch.getPlannedQuantityKg()).completionStatus(StageCompletionStatus.COMPLETED)
                .notes("Demonstration Stage 1 record").build());
        stageRepository.save(MixingStage.builder()
                .batch(batch).stageNumber(2).startTime(stage2Start).endTime(stage2End).officer(officer)
                .machine(batch.getMachine()).plannedQuantity(batch.getPlannedQuantityKg())
                .actualQuantity(batch.getPlannedQuantityKg()).completionStatus(StageCompletionStatus.COMPLETED)
                .notes("Demonstration Stage 2 record").build());
    }
}

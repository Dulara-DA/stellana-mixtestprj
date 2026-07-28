package com.stellana.mixing.config;

import com.stellana.mixing.domain.*;
import com.stellana.mixing.repository.*;
import com.stellana.mixing.service.ShiftService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.demo-data.enabled", havingValue = "true", matchIfMissing = true)
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
    private final ApprovedMaterialBatchRepository approvedMaterialBatchRepository;
    private final BlankingBatchRepository blankingBatchRepository;
    private final BlankingCartRepository blankingCartRepository;
    private final PressRepository pressRepository;
    private final CartTransferRepository cartTransferRepository;
    private final CartReceiptRepository cartReceiptRepository;
    private final MouldingProductionRecordRepository mouldingRecordRepository;
    private final MaterialShortageRequestRepository shortageRequestRepository;
    private final PasswordEncoder passwordEncoder;
    private final ShiftService shiftService;

    @Override
    @Transactional
    public void run(String... args) {
        if (userRepository.count() > 0) {
            ensureEmployeeIds();
            // An older prototype database containing the documented demo users
            // is upgraded idempotently. A real database with different users is
            // never populated with demo accounts or production records.
            if (userRepository.existsByEmailIgnoreCase("manager@stellana.local")
                    && userRepository.existsByEmailIgnoreCase("officer@stellana.local")
                    && userRepository.existsByEmailIgnoreCase("admin@stellana.local")) {
                seedDownstreamData();
            }
            return;
        }

        UserAccount manager = userRepository.save(UserAccount.builder()
                .fullName("Nadeesha Perera")
                .employeeId("MGR-001")
                .email("manager@stellana.local")
                .passwordHash("$2y$10$QWnKd6iWXK5FoT0ixYbMRuDwllMm/iaJfB3PafkBKLuy0UG1HD0JC")
                .role(Role.MANAGER)
                .active(true)
                .build());
        UserAccount officer = userRepository.save(UserAccount.builder()
                .fullName("Kasun Silva")
                .employeeId("MIX-001")
                .email("officer@stellana.local")
                .passwordHash("$2y$10$9igLjj71RbiOVxSZlS.IIeXy5oKsiqNrHefbIgWSz326ExgVnDFcC")
                .role(Role.MIXING_OFFICER)
                .active(true)
                .build());
        UserAccount admin = userRepository.save(UserAccount.builder()
                .fullName("System Administrator")
                .employeeId("SYS-001")
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

        seedDownstreamData();
    }

    private void ensureEmployeeIds() {
        userRepository.findAll().forEach(user -> {
            if (!StringUtils.hasText(user.getEmployeeId())) {
                user.setEmployeeId(switch (user.getEmail().toLowerCase()) {
                    case "manager@stellana.local" -> "MGR-001";
                    case "officer@stellana.local" -> "MIX-001";
                    case "admin@stellana.local" -> "SYS-001";
                    default -> "LEGACY-" + String.format("%04d", user.getId());
                });
                userRepository.save(user);
            }
        });
    }

    private void seedDownstreamData() {
        ensureEmployeeIds();
        UserAccount manager = requireUser("manager@stellana.local");
        UserAccount admin = requireUser("admin@stellana.local");
        UserAccount blankingOperator = ensureUser(
                "Ishara Fernando", "BLK-001", "blanking.operator@stellana.local",
                "Blanking123!", Role.BLANKING_OPERATOR);
        ensureUser(
                "Saman Jayawardena", "BLS-001", "blanking.supervisor@stellana.local",
                "BlankingSup123!", Role.BLANKING_SUPERVISOR);
        UserAccount mouldingOperator = ensureUser(
                "Tharindu Kumara", "MLD-001", "moulding.operator@stellana.local",
                "Moulding123!", Role.MOULDING_OPERATOR);
        ensureUser(
                "Shalini Perera", "MLS-001", "moulding.supervisor@stellana.local",
                "MouldingSup123!", Role.MOULDING_SUPERVISOR);
        ensureUser(
                "Dilshan Rodrigo", "LAB-001", "lab.officer@stellana.local",
                "LabOfficer123!", Role.LAB_OFFICER);

        Press press01 = ensurePress("PRESS-01", "Moulding Press 01");
        Press press02 = ensurePress("PRESS-02", "Moulding Press 02");
        ensurePress("PRESS-03", "Moulding Press 03");

        if (blankingBatchRepository.count() > 0) {
            return;
        }

        ProductionBatch releasedMixingBatch = batchRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(batch -> batch.getLaboratoryStatus() == LabDecision.PASS)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "Demo downstream data requires one laboratory-passed Mixing batch."));
        releasedMixingBatch.setStatus(BatchStatus.RELEASED_TO_BLANKING);
        releasedMixingBatch.setReleaseStatus(ReleaseStatus.APPROVED_FOR_BLANKING);
        batchRepository.save(releasedMixingBatch);
        LabSample approval = sampleRepository.findFirstByBatchIdOrderBySentToLabAtDesc(releasedMixingBatch.getId())
                .orElse(null);
        BigDecimal approvedQuantity = releasedMixingBatch.getActualOutputQuantityKg() == null
                ? releasedMixingBatch.getPlannedQuantityKg()
                : releasedMixingBatch.getActualOutputQuantityKg();
        ApprovedMaterialBatch approved = approvedMaterialBatchRepository
                .findByMixingBatchNumberIgnoreCase(releasedMixingBatch.getBatchNumber())
                .orElseGet(() -> approvedMaterialBatchRepository.save(ApprovedMaterialBatch.builder()
                        .mixingBatch(releasedMixingBatch)
                        .labApproval(approval)
                        .mixingBatchNumber(releasedMixingBatch.getBatchNumber())
                        .materialCode(releasedMixingBatch.getRecipeRevision().getRecipe().getRecipeCode())
                        .compoundName(releasedMixingBatch.getRecipeRevision().getRecipe().getCompoundName())
                        .labStatus(LabDecision.PASS)
                        .approvedQuantityKg(approvedQuantity)
                        .availableQuantityKg(approvedQuantity)
                        .approvedAt(approval != null && approval.getTestDateTime() != null
                                ? approval.getTestDateTime()
                                : LocalDateTime.now().minusHours(6))
                        .notes("Seeded approved batch linked to the existing Mixing and Lab records.")
                        .active(true)
                        .build()));

        ShiftService.ShiftContext shift = shiftService.current();
        BlankingBatch blankingOne = blankingBatchRepository.save(BlankingBatch.builder()
                .batchNumber("BLK-DEMO-001")
                .approvedMaterialBatch(approved)
                .mixingBatchNumber(approved.getMixingBatchNumber())
                .materialCode(approved.getMaterialCode())
                .materialConsumedKg(new BigDecimal("40.000"))
                .plannedProductionQuantity(120)
                .productionQuantity(120)
                .rejectedQuantity(4)
                .availableGoodBlankQuantity(51)
                .productionDate(shift.productionDate())
                .shift(shift.shift())
                .startTime(shift.serverTime().minusHours(5))
                .endTime(shift.serverTime().minusHours(4))
                .operator(blankingOperator)
                .operatorEmployeeId(blankingOperator.getEmployeeId())
                .notes("Demonstration Blanking batch with prepared and dispatched carts.")
                .status(BlankingBatchStatus.PARTIALLY_DISPATCHED)
                .build());
        BlankingBatch blankingTwo = blankingBatchRepository.save(BlankingBatch.builder()
                .batchNumber("BLK-DEMO-002")
                .approvedMaterialBatch(approved)
                .mixingBatchNumber(approved.getMixingBatchNumber())
                .materialCode(approved.getMaterialCode())
                .materialConsumedKg(new BigDecimal("35.000"))
                .plannedProductionQuantity(90)
                .productionQuantity(90)
                .rejectedQuantity(2)
                .availableGoodBlankQuantity(58)
                .productionDate(shift.productionDate())
                .shift(shift.shift())
                .startTime(shift.serverTime().minusHours(4))
                .endTime(shift.serverTime().minusHours(3))
                .operator(blankingOperator)
                .operatorEmployeeId(blankingOperator.getEmployeeId())
                .notes("Demonstration Blanking batch feeding Press 02.")
                .status(BlankingBatchStatus.PARTIALLY_DISPATCHED)
                .build());
        approved.setAvailableQuantityKg(approvedQuantity.subtract(new BigDecimal("75.000")));
        approvedMaterialBatchRepository.save(approved);

        BlankingCart dispatched = blankingCartRepository.save(BlankingCart.builder()
                .cartNumber("CART-DEMO-001")
                .blankingBatch(blankingOne)
                .materialCode(blankingOne.getMaterialCode())
                .quantity(40)
                .remainingQuantity(40)
                .createdBy(blankingOperator)
                .destinationPress(press01)
                .dispatchedAt(shift.serverTime().minusHours(2))
                .dispatchedBy(blankingOperator)
                .status(BlankingCartStatus.DISPATCHED)
                .blankingNote("Priority replenishment for Press 01.")
                .build());
        cartTransferRepository.save(CartTransfer.builder()
                .cart(dispatched)
                .fromSection(ProductionSection.BLANKING)
                .destinationPress(press01)
                .quantity(dispatched.getQuantity())
                .dispatchedBy(blankingOperator)
                .dispatchedAt(dispatched.getDispatchedAt())
                .status(CartTransferStatus.DISPATCHED)
                .build());

        BlankingCart received = blankingCartRepository.save(BlankingCart.builder()
                .cartNumber("CART-DEMO-002")
                .blankingBatch(blankingTwo)
                .materialCode(blankingTwo.getMaterialCode())
                .quantity(30)
                .remainingQuantity(12)
                .createdBy(blankingOperator)
                .destinationPress(press02)
                .dispatchedAt(shift.serverTime().minusHours(3))
                .dispatchedBy(blankingOperator)
                .status(BlankingCartStatus.PARTIALLY_CONSUMED)
                .blankingNote("Received at Press 02; sample production recorded.")
                .build());
        cartTransferRepository.save(CartTransfer.builder()
                .cart(received)
                .fromSection(ProductionSection.BLANKING)
                .destinationPress(press02)
                .quantity(received.getQuantity())
                .dispatchedBy(blankingOperator)
                .dispatchedAt(received.getDispatchedAt())
                .status(CartTransferStatus.RECEIVED)
                .build());
        cartReceiptRepository.save(CartReceipt.builder()
                .cart(received)
                .receivedQuantity(30)
                .productionDate(shift.productionDate())
                .shift(shift.shift())
                .receivedAt(shift.serverTime().minusHours(2).minusMinutes(45))
                .receivingOperator(mouldingOperator)
                .receivingOperatorEmployeeId(mouldingOperator.getEmployeeId())
                .press(press02)
                .sendingOperator(blankingOperator)
                .dispatchTime(received.getDispatchedAt())
                .receiptStatus(CartReceiptStatus.RECEIVED)
                .build());
        mouldingRecordRepository.save(MouldingProductionRecord.builder()
                .press(press02)
                .productionDate(shift.productionDate())
                .shift(shift.shift())
                .startTime(shift.serverTime().minusHours(2).minusMinutes(30))
                .endTime(shift.serverTime().minusHours(1))
                .operator(mouldingOperator)
                .operatorEmployeeId(mouldingOperator.getEmployeeId())
                .cart(received)
                .blankingBatch(blankingTwo)
                .quantityReceived(30)
                .goodTyreQuantity(16)
                .rejectedTyreQuantity(1)
                .rejectedTyreWeightPerItemGrams(new BigDecimal("100.000"))
                .totalRejectedTyreWeightGrams(new BigDecimal("100.000"))
                .rejectedBlankQuantity(1)
                .remainingBlankQuantity(12)
                .downtimeMinutes(8)
                .downtimeReason("Demonstration mould cleaning stop.")
                .operatorNote("Seed record; no rejection limits are inferred.")
                .status(MouldingRecordStatus.COMPLETED)
                .build());
        press02.setAvailableBlankQuantity(12);
        press02.setGoodTyreQuantity(16);
        press02.setRejectedTyreQuantity(1);
        press02.setRejectedBlankQuantity(1);
        press02.setCurrentOperator(mouldingOperator);
        press02.setCurrentBlankingBatch(blankingTwo);
        press02.setStatus(PressStatus.IDLE);
        press02.setLastActivityAt(shift.serverTime().minusHours(1));
        pressRepository.save(press02);

        blankingCartRepository.save(BlankingCart.builder()
                .cartNumber("CART-DEMO-003")
                .blankingBatch(blankingOne)
                .materialCode(blankingOne.getMaterialCode())
                .quantity(25)
                .remainingQuantity(25)
                .createdBy(blankingOperator)
                .destinationPress(press01)
                .status(BlankingCartStatus.PREPARED)
                .blankingNote("Prepared cart waiting for dispatch.")
                .build());

        MaterialShortageRequest shortage = MaterialShortageRequest.builder()
                .requestNumber("SRQ-DEMO-001")
                .press(press01)
                .currentBlankingBatch(blankingOne)
                .currentAvailableBlankQuantity(press01.getAvailableBlankQuantity())
                .requestedBlankQuantity(30)
                .requiredMaterialCode(blankingOne.getMaterialCode())
                .requiredAt(shift.serverTime().plusHours(1))
                .priority(ShortagePriority.URGENT)
                .sender(mouldingOperator)
                .senderEmployeeId(mouldingOperator.getEmployeeId())
                .productionDate(shift.productionDate())
                .senderShift(shift.shift())
                .status(ShortageStatus.OPEN)
                .build();
        shortage.addMessage(RequestMessage.builder()
                .sender(mouldingOperator)
                .message("Press 01 requires another 30 blanks for the current production plan.")
                .statusSnapshot(ShortageStatus.OPEN)
                .build());
        shortageRequestRepository.save(shortage);

        auditLogRepository.save(AuditLog.builder()
                .actor(admin)
                .action("INITIALIZE_DOWNSTREAM_DEMO_DATA")
                .entityType("System")
                .previousValue(null)
                .newValue("Blanking and Moulding demonstration records created")
                .actionTime(LocalDateTime.now())
                .build());
    }

    private UserAccount ensureUser(String fullName, String employeeId, String email,
                                   String password, Role role) {
        return userRepository.findByEmailIgnoreCase(email)
                .orElseGet(() -> userRepository.save(UserAccount.builder()
                        .fullName(fullName)
                        .employeeId(employeeId)
                        .email(email)
                        .passwordHash(passwordEncoder.encode(password))
                        .role(role)
                        .active(true)
                        .build()));
    }

    private UserAccount requireUser(String email) {
        return userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new IllegalStateException("Required demo user not found: " + email));
    }

    private Press ensurePress(String number, String name) {
        return pressRepository.findByPressNumberIgnoreCase(number)
                .orElseGet(() -> pressRepository.save(Press.builder()
                        .pressNumber(number)
                        .pressName(name)
                        .status(PressStatus.WAITING_FOR_BLANKS)
                        .availableBlankQuantity(0)
                        .goodTyreQuantity(0)
                        .rejectedTyreQuantity(0)
                        .rejectedBlankQuantity(0)
                        .lastActivityAt(LocalDateTime.now().minusMinutes(20))
                        .active(true)
                        .build()));
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

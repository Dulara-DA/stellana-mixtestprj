package com.stellana.mixing.api;

import com.stellana.mixing.domain.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class ApiModels {
    private ApiModels() {}

    public record LoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password
    ) {}

    public record AuthResponse(String token, UserView user) {}

    public record UserView(
            Long id,
            String fullName,
            String employeeId,
            String email,
            Role role,
            boolean active
    ) {}

    public record OperatorOptionView(
            String employeeId,
            String fullName
    ) {}

    public record CreateUserRequest(
            @NotBlank String fullName,
            @NotBlank String employeeId,
            @NotBlank @Email String email,
            @Size(min = 8) String password,
            @NotNull Role role
    ) {}

    public record UserStatusRequest(@NotNull Boolean active) {}

    public record IngredientInput(
            @NotBlank String materialCode,
            @NotBlank String materialName,
            @NotNull @DecimalMin("0.001") BigDecimal requiredQuantity,
            @NotBlank String unit,
            @NotNull @Min(1) Integer additionSequence,
            @NotNull @Min(1) @Max(2) Integer stageNumber,
            @Min(1) Integer mixingTimeSeconds,
            BigDecimal temperatureCelsius,
            BigDecimal speedRpm,
            String instructions
    ) {}

    public record RecipeRevisionRequest(
            @NotBlank String recipeCode,
            @NotBlank String compoundName,
            @NotBlank String revisionNumber,
            @NotNull LocalDate effectiveDate,
            @NotNull RecipeStatus status,
            String revisionNotes,
            @NotEmpty List<@Valid IngredientInput> ingredients
    ) {}

    public record RecipeStatusRequest(@NotNull RecipeStatus status) {}

    public record IngredientView(
            Long id,
            String materialCode,
            String materialName,
            BigDecimal requiredQuantity,
            String unit,
            Integer additionSequence,
            Integer stageNumber,
            Integer mixingTimeSeconds,
            BigDecimal temperatureCelsius,
            BigDecimal speedRpm,
            String instructions
    ) {}

    public record RecipeRevisionView(
            Long id,
            Long recipeId,
            String recipeCode,
            String compoundName,
            String revisionNumber,
            LocalDate effectiveDate,
            LocalDateTime lastUpdatedDate,
            RecipeStatus status,
            UserView createdBy,
            UserView approvedBy,
            LocalDateTime approvedAt,
            String revisionNotes,
            List<IngredientView> ingredients
    ) {}

    public record CreateBatchRequest(
            @NotBlank String batchNumber,
            @NotNull Long recipeRevisionId,
            @NotNull @DecimalMin("0.001") @DecimalMax("240.000") BigDecimal plannedQuantityKg,
            @NotBlank String machine,
            Long assignedOfficerId,
            Long reprocessingSourceBatchId
    ) {}

    public record BatchTransitionRequest(
            @NotNull BatchStatus status,
            String reason
    ) {}

    public record BatchView(
            Long id,
            String batchNumber,
            String factoryReference,
            Long recipeRevisionId,
            String recipeCode,
            String compoundName,
            String revisionNumber,
            BigDecimal plannedQuantityKg,
            BigDecimal actualOutputQuantityKg,
            String machine,
            UserView assignedOfficer,
            LocalDateTime createdAt,
            BatchStatus status,
            Integer currentStage,
            String issueOrStoppageReason,
            Long reprocessingSourceBatchId,
            String reprocessingSourceBatchNumber,
            LabDecision laboratoryStatus,
            ReleaseStatus releaseStatus,
            String traceabilityCode,
            LocalDateTime stage1StartedAt,
            LocalDateTime stage1CompletedAt,
            LocalDateTime stage2StartedAt,
            LocalDateTime stage2CompletedAt
    ) {}

    public record TraceabilityView(
            String batchNumber,
            String factoryReference,
            String recipeCode,
            String compoundName,
            String revisionNumber,
            BigDecimal plannedQuantityKg,
            BigDecimal actualOutputQuantityKg,
            String machine,
            BatchStatus currentStatus,
            LabDecision laboratoryDecision,
            String sampleId,
            LocalDateTime testDateTime,
            ReleaseStatus releaseStatus,
            LocalDateTime stage1StartedAt,
            LocalDateTime stage1CompletedAt,
            LocalDateTime stage2StartedAt,
            LocalDateTime stage2CompletedAt
    ) {}

    public record StatusHistoryView(
            Long id,
            BatchStatus previousStatus,
            BatchStatus newStatus,
            UserView changedBy,
            LocalDateTime changedAt,
            String reason
    ) {}

    public record MaterialItemRequest(
            @NotBlank String materialCode,
            @NotBlank String materialName,
            @NotNull @DecimalMin("0.001") BigDecimal requiredQuantity,
            @NotNull @DecimalMin("0.001") BigDecimal requestedQuantity,
            @NotBlank String unit
    ) {}

    public record CreateMaterialRequest(
            @NotNull Long batchId,
            String notes,
            List<@Valid MaterialItemRequest> items
    ) {}

    public record MaterialIssueItem(
            @NotNull Long itemId,
            @NotNull @DecimalMin("0.000") BigDecimal issuedQuantity,
            String rawMaterialLotNumber
    ) {}

    public record IssueMaterialsRequest(
            @NotEmpty List<@Valid MaterialIssueItem> items,
            String notes
    ) {}

    public record MaterialItemView(
            Long id,
            String materialCode,
            String materialName,
            BigDecimal requiredQuantity,
            BigDecimal requestedQuantity,
            BigDecimal issuedQuantity,
            String unit,
            String rawMaterialLotNumber
    ) {}

    public record MaterialRequestView(
            Long id,
            String requestNumber,
            Long batchId,
            String batchNumber,
            String recipeCode,
            String revisionNumber,
            UserView requestingOfficer,
            LocalDateTime requestedAt,
            MaterialRequestStatus status,
            String notes,
            UserView issuedBy,
            LocalDateTime issuedAt,
            List<MaterialItemView> items
    ) {}

    public record StartStageRequest(
            @NotNull Long batchId,
            @NotNull @Min(1) @Max(2) Integer stageNumber,
            String machine,
            Boolean managerOverride,
            String overrideReason
    ) {}

    public record StageCompleteRequest(
            @NotNull @DecimalMin("0.001") BigDecimal actualQuantity,
            BigDecimal temperatureCelsius,
            @Min(1) Integer mixingTimeSeconds,
            BigDecimal speedRpm,
            String notes
    ) {}

    public record PauseStageRequest(@NotBlank String reason) {}

    public record PauseEventView(
            Long id,
            LocalDateTime pausedAt,
            LocalDateTime resumedAt,
            String reason,
            UserView recordedBy
    ) {}

    public record StageView(
            Long id,
            Long batchId,
            String batchNumber,
            String factoryReference,
            Integer stageNumber,
            LocalDateTime startTime,
            LocalDateTime endTime,
            UserView officer,
            String machine,
            BigDecimal plannedQuantity,
            BigDecimal actualQuantity,
            BigDecimal temperatureCelsius,
            Integer mixingTimeSeconds,
            BigDecimal speedRpm,
            String notes,
            StageCompletionStatus completionStatus,
            boolean managerOverride,
            String overrideReason,
            List<PauseEventView> pauseEvents
    ) {}

    public record AdditionalLabResultInput(
            @NotBlank String testName,
            @NotBlank String resultValue,
            String unit
    ) {}

    public record LabResultRequest(
            BigDecimal hardness,
            BigDecimal resilience,
            BigDecimal curingTimeMinutes,
            @NotNull LabDecision decision,
            String comments,
            Boolean reprocessingDecision,
            List<@Valid AdditionalLabResultInput> additionalResults
    ) {}

    public record AdditionalLabResultView(Long id, String testName, String resultValue, String unit) {}

    public record LabSampleView(
            Long id,
            String sampleId,
            Long batchId,
            String batchNumber,
            String recipeCode,
            String revisionNumber,
            LocalDateTime sentToLabAt,
            LocalDateTime testDateTime,
            BigDecimal hardness,
            BigDecimal resilience,
            BigDecimal curingTimeMinutes,
            LabDecision decision,
            UserView testedBy,
            String comments,
            boolean reprocessingDecision,
            UserView managerApprovedBy,
            LocalDateTime managerApprovedAt,
            List<AdditionalLabResultView> additionalResults
    ) {}

    public record TestSpecificationRequest(
            Long recipeId,
            @NotBlank String testName,
            BigDecimal minimumValue,
            BigDecimal maximumValue,
            String unit,
            String notes
    ) {}

    public record TestSpecificationView(
            Long id,
            Long recipeId,
            String recipeCode,
            String testName,
            BigDecimal minimumValue,
            BigDecimal maximumValue,
            String unit,
            String notes,
            boolean active
    ) {}

    public record CreateIssueRequest(
            Long batchId,
            @NotNull IssuePriority priority,
            @NotBlank String subject,
            @NotBlank String message
    ) {}

    public record IssueReplyRequest(@NotBlank String message) {}
    public record IssueStatusRequest(@NotNull IssueStatus status) {}

    public record IssueMessageView(
            Long id,
            UserView sender,
            String message,
            LocalDateTime sentAt
    ) {}

    public record IssueView(
            Long id,
            Long batchId,
            String batchNumber,
            IssuePriority priority,
            String subject,
            IssueStatus status,
            UserView createdBy,
            UserView assignedManager,
            boolean unreadByManager,
            boolean unreadByOfficer,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            List<IssueMessageView> messages
    ) {}

    public record NotificationView(
            Long id,
            NotificationType type,
            String title,
            String message,
            String referenceType,
            Long referenceId,
            boolean read,
            LocalDateTime createdAt
    ) {}

    public record AuditView(
            Long id,
            UserView actor,
            String action,
            String entityType,
            Long entityId,
            String previousValue,
            String newValue,
            LocalDateTime actionTime,
            Long relatedBatchId,
            Long relatedRecipeId
    ) {}

    public record DashboardSummary(
            long activeBatches,
            long waitingForMaterials,
            long waitingForLab,
            long passedBatches,
            long failedBatches,
            long stoppedOrDelayed,
            long unreadIssues,
            List<BatchView> activeBatchDetails,
            List<BatchView> batchBoard,
            List<AuditView> recentActivity
    ) {}

    public record ShiftContextView(
            LocalDate productionDate,
            ProductionShift shift,
            LocalDateTime serverTime,
            LocalDateTime shiftStart,
            LocalDateTime shiftEnd
    ) {}

    public record ApprovedMaterialBatchView(
            Long id,
            Long mixingBatchId,
            Long labApprovalId,
            String mixingBatchNumber,
            String materialCode,
            String compoundName,
            LabDecision labStatus,
            BigDecimal approvedQuantityKg,
            BigDecimal availableQuantityKg,
            BigDecimal plannedQuantityKg,
            BigDecimal receivedQuantityKg,
            BigDecimal reservedQuantityKg,
            BigDecimal consumedQuantityKg,
            BigDecimal returnedQuantityKg,
            LocalDateTime approvedAt,
            LocalDateTime receivedAt,
            UserView receivingOperator,
            CompoundStockStatus stockStatus,
            String notes,
            boolean active,
            LocalDateTime lastUpdatedAt
    ) {}

    public record CompoundStockStatusRequest(
            @NotNull CompoundStockStatus status,
            @NotBlank String reason
    ) {}

    public record CreateBlankingBatchRequest(
            @NotBlank String batchNumber,
            Long approvedMaterialBatchId,
            String mixingBatchNumber,
            String materialCode,
            @NotNull @DecimalMin("0.001") BigDecimal materialConsumedKg,
            @NotNull @Min(1) Integer plannedProductionQuantity,
            String itemCode,
            String millOperator,
            String preformerOperator,
            @DecimalMin("0.001") BigDecimal averageBlankWeightGrams,
            String notes,
            Boolean startImmediately
    ) {}

    public record CompleteBlankingBatchRequest(
            @NotNull @Min(1) Integer productionQuantity,
            @NotNull @Min(0) Integer rejectedQuantity,
            @Min(0) Integer actualGoodBlankQuantity,
            @DecimalMin("0.000") BigDecimal rejectedMaterialWeightKg,
            @DecimalMin("0.000") BigDecimal measuredRemainingCompoundWeightKg,
            Boolean supervisorConfirmation,
            String balanceConfirmationReason,
            String notes
    ) {}

    public record CorrectBlankingBatchRequest(
            @NotNull @Min(0) Integer actualGoodBlankQuantity,
            @NotNull @Min(0) Integer rejectedQuantity,
            @NotNull @DecimalMin("0.000") BigDecimal rejectedMaterialWeightKg,
            @NotNull @DecimalMin("0.000") BigDecimal measuredRemainingCompoundWeightKg,
            @NotBlank String reason
    ) {}

    public record BlankingBatchView(
            Long id,
            String batchNumber,
            Long approvedMaterialBatchId,
            String mixingBatchNumber,
            String materialCode,
            String itemCode,
            String millOperator,
            String preformerOperator,
            BigDecimal materialConsumedKg,
            BigDecimal averageBlankWeightGrams,
            BigDecimal expectedBlankQuantity,
            Integer expectedWholeBlankQuantity,
            Integer plannedProductionQuantity,
            Integer productionQuantity,
            Integer actualGoodBlankQuantity,
            Integer rejectedQuantity,
            BigDecimal rejectedMaterialWeightKg,
            BigDecimal actualUsedCompoundWeightKg,
            BigDecimal remainingCompoundWeightKg,
            Integer productionVariance,
            boolean fractionalExpectedQuantity,
            boolean unbalanced,
            String balanceConfirmationReason,
            UserView balanceConfirmedBy,
            Integer availableGoodBlankQuantity,
            Integer assignedToCartsQuantity,
            LocalDate productionDate,
            ProductionShift shift,
            LocalDateTime startTime,
            LocalDateTime endTime,
            UserView operator,
            String operatorEmployeeId,
            String notes,
            BlankingBatchStatus status,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {}

    public record CreateBlankingCartRequest(
            @NotBlank String cartNumber,
            @NotNull Long blankingBatchId,
            @NotNull @Min(1) Integer quantity,
            @NotNull Long destinationPressId,
            String blankingNote,
            Long shortageRequestId
    ) {}

    public record DispatchCartRequest(String note) {}
    public record HoldCartRequest(@NotBlank String reason) {}
    public record ReleaseCartRequest(String note) {}

    public record BlankingCartView(
            Long id,
            String cartNumber,
            Long blankingBatchId,
            String blankingBatchNumber,
            String mixingBatchNumber,
            String materialCode,
            String itemCode,
            Integer quantity,
            Integer remainingQuantity,
            Integer returnedQuantity,
            BigDecimal averageBlankWeightGrams,
            BigDecimal materialWeightKg,
            LocalDateTime createdAt,
            UserView createdBy,
            Long destinationPressId,
            String destinationPressNumber,
            String destinationPressName,
            LocalDateTime dispatchedAt,
            UserView dispatchedBy,
            LocalDateTime heldAt,
            UserView heldBy,
            String holdReason,
            LocalDateTime releasedAt,
            UserView releasedBy,
            BlankingCartStatus status,
            String blankingNote
    ) {}

    public record PressView(
            Long id,
            String pressNumber,
            String pressName,
            PressStatus status,
            ProductionShift currentShift,
            UserView currentOperator,
            Long currentBlankingBatchId,
            String currentBlankingBatchNumber,
            Integer availableBlankQuantity,
            Integer goodTyreQuantity,
            Integer rejectedTyreQuantity,
            Integer rejectedBlankQuantity,
            long cartsWaitingToBeReceived,
            Integer estimatedNextBlankRequirement,
            LocalDateTime lastActivityAt,
            boolean active
    ) {}

    public record PressStatusRequest(
            @NotNull PressStatus status,
            String reason
    ) {}

    public record ReceiveCartRequest(
            @NotNull Long pressId,
            Boolean supervisorOverride,
            String overrideReason
    ) {}

    public record CartReceiptView(
            Long id,
            String receiptNumber,
            Long cartId,
            String cartNumber,
            String blankingBatchNumber,
            Integer receivedQuantity,
            LocalDate productionDate,
            ProductionShift shift,
            LocalDateTime receivedAt,
            UserView receivingOperator,
            String receivingOperatorEmployeeId,
            Long pressId,
            String pressNumber,
            UserView sendingOperator,
            LocalDateTime dispatchTime,
            CartReceiptStatus receiptStatus,
            String overrideReason
    ) {}

    public record StartMouldingRecordRequest(
            @NotNull Long pressId,
            @NotNull Long cartId
    ) {}

    public record CompleteMouldingRecordRequest(
            @NotNull @Min(0) Integer goodTyreQuantity,
            @NotNull @Min(0) Integer rejectedTyreQuantity,
            @NotNull @DecimalMin("0.000") BigDecimal rejectedTyreWeightPerItemGrams,
            @NotNull @Min(0) Integer rejectedBlankQuantity,
            @NotNull @Min(0) Integer downtimeMinutes,
            String downtimeReason,
            String operatorNote
    ) {}

    public record CorrectMouldingRecordRequest(
            @NotNull @Min(0) Integer goodTyreQuantity,
            @NotNull @Min(0) Integer rejectedTyreQuantity,
            @NotNull @DecimalMin("0.000") BigDecimal rejectedTyreWeightPerItemGrams,
            @NotNull @Min(0) Integer rejectedBlankQuantity,
            @NotNull @Min(0) Integer downtimeMinutes,
            String downtimeReason,
            String operatorNote,
            @NotBlank String correctionReason
    ) {}

    public record MouldingProductionRecordView(
            Long id,
            Long pressId,
            String pressNumber,
            LocalDate productionDate,
            ProductionShift shift,
            LocalDateTime startTime,
            LocalDateTime endTime,
            UserView operator,
            String operatorEmployeeId,
            Long cartId,
            String cartNumber,
            Long blankingBatchId,
            String blankingBatchNumber,
            String itemCode,
            String compoundCode,
            String compoundBatchNumber,
            Integer quantityReceived,
            Integer goodTyreQuantity,
            Integer rejectedTyreQuantity,
            BigDecimal rejectedTyreWeightPerItemGrams,
            BigDecimal totalRejectedTyreWeightGrams,
            Integer rejectedBlankQuantity,
            Integer remainingBlankQuantity,
            Integer downtimeMinutes,
            String downtimeReason,
            String operatorNote,
            MouldingRecordStatus status,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {}

    public record CreateBlankReturnRequest(
            @NotNull Long cartId,
            @NotNull Long pressId,
            @NotNull @Min(1) Integer quantity,
            @NotNull @DecimalMin("0.000") BigDecimal measuredReturnWeightKg,
            @NotBlank String returnReason,
            String mouldingNote
    ) {}

    public record ConfirmBlankReturnRequest(
            @NotNull @Min(0) Integer receivedQuantity,
            @NotNull @DecimalMin("0.000") BigDecimal receivedWeightKg,
            String varianceNote
    ) {}

    public record BlankReturnView(
            Long id,
            String returnNumber,
            Long pressId,
            String pressNumber,
            Long cartId,
            String cartNumber,
            Long blankingBatchId,
            String blankingBatchNumber,
            String compoundCode,
            String compoundBatchNumber,
            String itemCode,
            Integer preparedQuantity,
            BigDecimal measuredReturnWeightKg,
            BigDecimal averageBlankWeightGrams,
            String returnReason,
            UserView sendingOperator,
            LocalDateTime sendingDateTime,
            ProductionShift shift,
            String mouldingNote,
            UserView receivingOperator,
            LocalDateTime receivingDateTime,
            Integer receivedQuantity,
            BigDecimal receivedWeightKg,
            Integer quantityVariance,
            BigDecimal weightVarianceKg,
            String varianceNote,
            BlankReturnStatus status,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {}

    public record InventoryTransactionView(
            Long id,
            InventoryTransactionType transactionType,
            ProductionSection sourceSection,
            ProductionSection destinationSection,
            String sourceRecordType,
            Long sourceRecordId,
            String destinationRecordType,
            Long destinationRecordId,
            BigDecimal quantity,
            String unit,
            BigDecimal weightKg,
            UserView actor,
            LocalDateTime transactionTime,
            String reasonReference
    ) {}

    public record ProductionGenealogyView(
            ApprovedMaterialBatchView compoundStock,
            List<BlankingBatchView> blankingBatches,
            List<BlankingCartView> carts,
            List<CartReceiptView> receipts,
            List<MouldingProductionRecordView> productionRecords,
            List<BlankReturnView> returns,
            List<InventoryTransactionView> inventoryTransactions
    ) {}

    public record CreateShortageRequest(
            @NotNull Long pressId,
            Long currentBlankingBatchId,
            @NotNull @Min(1) Integer requestedBlankQuantity,
            @NotBlank String requiredMaterialCode,
            @NotNull LocalDateTime requiredAt,
            @NotNull ShortagePriority priority,
            @NotBlank String message
    ) {}

    public record ShortageStatusUpdateRequest(
            @NotNull ShortageStatus status,
            Long linkedCartId,
            String response
    ) {}

    public record ShortageMessageRequest(@NotBlank String message) {}

    public record RequestMessageView(
            Long id,
            UserView sender,
            String message,
            ShortageStatus statusSnapshot,
            LocalDateTime sentAt
    ) {}

    public record MaterialShortageRequestView(
            Long id,
            String requestNumber,
            Long pressId,
            String pressNumber,
            Long currentBlankingBatchId,
            String currentBlankingBatchNumber,
            Integer currentAvailableBlankQuantity,
            Integer requestedBlankQuantity,
            String requiredMaterialCode,
            LocalDateTime requiredAt,
            ShortagePriority priority,
            UserView sender,
            String senderEmployeeId,
            LocalDate productionDate,
            ProductionShift senderShift,
            ShortageStatus status,
            Long linkedCartId,
            String linkedCartNumber,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            List<RequestMessageView> messages
    ) {}

    public record OperatorProductivityView(
            UserView operator,
            String employeeId,
            long completedRuns,
            long goodTyres,
            long rejectedTyres,
            long rejectedBlanks,
            long downtimeMinutes
    ) {}

    public record ProductionManagerSummary(
            LocalDate fromDate,
            LocalDate toDate,
            ProductionShift shift,
            BigDecimal compoundRequiredKg,
            BigDecimal compoundReceivedKg,
            BigDecimal compoundUsedKg,
            BigDecimal compoundAvailableKg,
            BigDecimal expectedBlankQuantity,
            long actualGoodBlankQuantity,
            long blankingProductionVariance,
            long blankingRejectedQuantity,
            BigDecimal blankingRejectedWeightKg,
            long cartsPrepared,
            long cartsHeld,
            long cartsDispatched,
            long cartsReceived,
            long cartsReturned,
            long returnedBlankQuantity,
            BigDecimal averageCartTransferMinutes,
            BigDecimal returnedBlankWeightKg,
            long returnVariances,
            long unbalancedRecords,
            long blankingBatchesProduced,
            long blanksProduced,
            long blanksDispatched,
            long blanksAvailableAtBlanking,
            long blanksAvailableAtPresses,
            long goodTyres,
            long rejectedTyres,
            BigDecimal rejectedTyreWeightGrams,
            long rejectedBlanks,
            BigDecimal rejectionPercentage,
            long openShortageRequests,
            long delayedCartTransfers,
            long pressesWaitingForBlanks,
            List<PressView> presses,
            List<BlankingCartView> cartTransfers,
            List<OperatorProductivityView> operatorProductivity,
            List<MouldingProductionRecordView> recentRecords
    ) {}

    public record ErrorResponse(
            LocalDateTime timestamp,
            int status,
            String error,
            String message,
            Map<String, String> fieldErrors
    ) {}
}

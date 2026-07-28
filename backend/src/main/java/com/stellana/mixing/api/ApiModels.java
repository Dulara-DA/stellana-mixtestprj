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

    public record UserView(Long id, String fullName, String email, Role role, boolean active) {}

    public record CreateUserRequest(
            @NotBlank String fullName,
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

    public record ErrorResponse(
            LocalDateTime timestamp,
            int status,
            String error,
            String message,
            Map<String, String> fieldErrors
    ) {}
}

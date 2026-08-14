package com.stellana.mixing.api;

import com.stellana.mixing.domain.*;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

import static com.stellana.mixing.api.ApiModels.*;

public final class ApiMapper {
    private ApiMapper() {}

    public static UserView user(UserAccount value) {
        return value == null ? null : new UserView(
                value.getId(), value.getFullName(), value.getEmployeeId(), value.getEmail(),
                value.getRole(), value.isActive());
    }

    public static RecipeRevisionView recipeRevision(RecipeRevision value) {
        List<IngredientView> ingredients = value.getIngredients().stream()
                .sorted(Comparator.comparing(RecipeIngredient::getAdditionSequence))
                .map(i -> new IngredientView(i.getId(), i.getMaterialCode(), i.getMaterialName(),
                        i.getRequiredQuantity(), i.getUnit(), i.getAdditionSequence(), i.getStageNumber(),
                        i.getMixingTimeSeconds(), i.getTemperatureCelsius(), i.getSpeedRpm(), i.getInstructions()))
                .toList();
        return new RecipeRevisionView(value.getId(), value.getRecipe().getId(), value.getRecipe().getRecipeCode(),
                value.getRecipe().getCompoundName(), value.getRevisionNumber(), value.getEffectiveDate(),
                value.getUpdatedAt(), value.getStatus(), user(value.getCreatedBy()), user(value.getApprovedBy()),
                value.getApprovedAt(), value.getRevisionNotes(), ingredients);
    }

    public static BatchView batch(ProductionBatch value) {
        ProductionBatch source = value.getReprocessingSourceBatch();
        return new BatchView(value.getId(), value.getBatchNumber(), factoryReference(value),
                value.getRecipeRevision().getId(),
                value.getRecipeRevision().getRecipe().getRecipeCode(), value.getRecipeRevision().getRecipe().getCompoundName(),
                value.getRecipeRevision().getRevisionNumber(), value.getPlannedQuantityKg(),
                value.getActualOutputQuantityKg(), value.getMachine(), user(value.getAssignedOfficer()),
                value.getCreatedAt(), value.getPlannedStartTime(), value.getTargetCompletionTime(),
                value.getProductionPriority() == null ? ProductionPriority.NORMAL : value.getProductionPriority(),
                value.getScheduleNotes(), user(value.getScheduledBy()), value.getScheduledAt(), scheduleTiming(value),
                value.getStatus(), value.getCurrentStage(), value.getIssueOrStoppageReason(),
                source == null ? null : source.getId(), source == null ? null : source.getBatchNumber(),
                value.getLaboratoryStatus(), value.getReleaseStatus(),
                Boolean.TRUE.equals(value.getTemporaryLabBypass()), value.getTemporaryLabBypassReason(),
                user(value.getTemporaryLabBypassApprovedBy()), value.getTemporaryLabBypassApprovedAt(),
                value.getTraceabilityCode(),
                value.getStage1StartedAt(), value.getStage1CompletedAt(), value.getStage2StartedAt(),
                value.getStage2CompletedAt());
    }

    private static ScheduleTimingStatus scheduleTiming(ProductionBatch value) {
        if (value.getPlannedStartTime() == null || value.getTargetCompletionTime() == null) {
            return ScheduleTimingStatus.UNSCHEDULED;
        }
        if (value.getStatus() == BatchStatus.CANCELLED) {
            return ScheduleTimingStatus.CANCELLED;
        }
        LocalDateTime completedAt = value.getStage2CompletedAt();
        if (completedAt != null) {
            return completedAt.isAfter(value.getTargetCompletionTime())
                    ? ScheduleTimingStatus.COMPLETED_LATE
                    : ScheduleTimingStatus.COMPLETED_ON_TIME;
        }
        LocalDateTime now = LocalDateTime.now();
        if (now.isAfter(value.getTargetCompletionTime())) {
            return ScheduleTimingStatus.OVERDUE;
        }
        boolean started = value.getStage1StartedAt() != null;
        if (started && Duration.between(now, value.getTargetCompletionTime()).toMinutes() <= 30) {
            return ScheduleTimingStatus.DUE_SOON;
        }
        if (started) {
            return ScheduleTimingStatus.IN_PROGRESS;
        }
        return now.isBefore(value.getPlannedStartTime())
                ? ScheduleTimingStatus.SCHEDULED
                : ScheduleTimingStatus.READY_TO_START;
    }

    public static StatusHistoryView statusHistory(BatchStatusHistory value) {
        return new StatusHistoryView(value.getId(), value.getPreviousStatus(), value.getNewStatus(),
                user(value.getChangedBy()), value.getChangedAt(), value.getReason());
    }

    public static MaterialRequestView materialRequest(MaterialRequest value) {
        List<MaterialItemView> items = value.getItems().stream()
                .map(i -> new MaterialItemView(i.getId(), i.getMaterialCode(), i.getMaterialName(),
                        i.getRequiredQuantity(), i.getRequestedQuantity(), i.getIssuedQuantity(), i.getUnit(),
                        i.getRawMaterialLotNumber()))
                .toList();
        return new MaterialRequestView(value.getId(), value.getRequestNumber(), value.getBatch().getId(),
                value.getBatch().getBatchNumber(), value.getBatch().getRecipeRevision().getRecipe().getRecipeCode(),
                value.getBatch().getRecipeRevision().getRevisionNumber(), user(value.getRequestingOfficer()),
                value.getRequestedAt(), value.getStatus(), value.getNotes(), user(value.getIssuedBy()),
                value.getIssuedAt(), items);
    }

    public static StageView stage(MixingStage value) {
        List<PauseEventView> pauses = value.getPauseEvents().stream()
                .sorted(Comparator.comparing(StagePauseEvent::getPausedAt))
                .map(p -> new PauseEventView(p.getId(), p.getPausedAt(), p.getResumedAt(), p.getReason(), user(p.getRecordedBy())))
                .toList();
        return new StageView(value.getId(), value.getBatch().getId(), value.getBatch().getBatchNumber(),
                factoryReference(value.getBatch()),
                value.getStageNumber(), value.getStartTime(), value.getEndTime(), user(value.getOfficer()),
                value.getMachine(), value.getPlannedQuantity(), value.getActualQuantity(), value.getTemperatureCelsius(),
                value.getMixingTimeSeconds(), value.getSpeedRpm(), value.getNotes(), value.getCompletionStatus(),
                value.isManagerOverride(), value.getOverrideReason(), pauses);
    }

    public static String factoryReference(ProductionBatch value) {
        return value.getRecipeRevision().getRecipe().getRecipeCode() + " × " + value.getBatchNumber();
    }

    public static LabSampleView labSample(LabSample value) {
        List<AdditionalLabResultView> results = value.getAdditionalResults().stream()
                .map(r -> new AdditionalLabResultView(r.getId(), r.getTestName(), r.getResultValue(), r.getUnit()))
                .toList();
        return new LabSampleView(value.getId(), value.getSampleId(), value.getBatch().getId(),
                value.getBatch().getBatchNumber(), value.getBatch().getRecipeRevision().getRecipe().getRecipeCode(),
                value.getBatch().getRecipeRevision().getRevisionNumber(), value.getSentToLabAt(),
                value.getTestDateTime(), value.getHardness(), value.getResilience(), value.getCuringTimeMinutes(),
                value.getDecision(), user(value.getTestedBy()), value.getComments(), value.isReprocessingDecision(),
                user(value.getManagerApprovedBy()), value.getManagerApprovedAt(), results);
    }

    public static IssueView issue(IssueThread value) {
        List<IssueMessageView> messages = value.getMessages().stream()
                .sorted(Comparator.comparing(IssueMessage::getCreatedAt))
                .map(m -> new IssueMessageView(m.getId(), user(m.getSender()), m.getMessage(), m.getCreatedAt()))
                .toList();
        return new IssueView(value.getId(), value.getBatch() == null ? null : value.getBatch().getId(),
                value.getBatch() == null ? null : value.getBatch().getBatchNumber(), value.getPriority(),
                value.getSubject(), value.getStatus(), user(value.getCreatedBy()), user(value.getAssignedManager()),
                value.isUnreadByManager(), value.isUnreadByOfficer(), value.getCreatedAt(), value.getUpdatedAt(), messages);
    }

    public static NotificationView notification(Notification value) {
        return new NotificationView(value.getId(), value.getType(), value.getTitle(), value.getMessage(),
                value.getReferenceType(), value.getReferenceId(), value.isReadFlag(), value.getCreatedAt());
    }

    public static AuditView audit(AuditLog value) {
        return new AuditView(value.getId(), user(value.getActor()), value.getAction(), value.getEntityType(),
                value.getEntityId(), value.getPreviousValue(), value.getNewValue(), value.getActionTime(),
                value.getRelatedBatchId(), value.getRelatedRecipeId());
    }

    public static ApprovedMaterialBatchView approvedMaterialBatch(ApprovedMaterialBatch value) {
        ProductionBatch mixingBatch = value.getMixingBatch();
        boolean temporaryLabBypass = mixingBatch != null
                && Boolean.TRUE.equals(mixingBatch.getTemporaryLabBypass());
        return new ApprovedMaterialBatchView(
                value.getId(),
                mixingBatch == null ? null : mixingBatch.getId(),
                value.getLabApproval() == null ? null : value.getLabApproval().getId(),
                value.getMixingBatchNumber(),
                value.getMaterialCode(),
                value.getCompoundName(),
                value.getLabStatus(),
                value.getApprovedQuantityKg(),
                value.getAvailableQuantityKg(),
                value.getPlannedQuantityKg() == null ? value.getApprovedQuantityKg() : value.getPlannedQuantityKg(),
                value.getReceivedQuantityKg() == null ? value.getApprovedQuantityKg() : value.getReceivedQuantityKg(),
                zero(value.getReservedQuantityKg()),
                zero(value.getConsumedQuantityKg()),
                zero(value.getReturnedQuantityKg()),
                value.getApprovedAt(),
                value.getReceivedAt(),
                user(value.getReceivingOperator()),
                value.getStockStatus() == null ? CompoundStockStatus.AVAILABLE : value.getStockStatus(),
                temporaryLabBypass,
                temporaryLabBypass ? mixingBatch.getTemporaryLabBypassReason() : null,
                temporaryLabBypass ? user(mixingBatch.getTemporaryLabBypassApprovedBy()) : null,
                temporaryLabBypass ? mixingBatch.getTemporaryLabBypassApprovedAt() : null,
                value.getNotes(),
                value.isActive(),
                value.getUpdatedAt());
    }

    public static BlankingBatchView blankingBatch(BlankingBatch value) {
        return new BlankingBatchView(
                value.getId(),
                value.getBatchNumber(),
                value.getApprovedMaterialBatch() == null ? null : value.getApprovedMaterialBatch().getId(),
                value.getMixingBatchNumber(),
                value.getMaterialCode(),
                value.getItemCode(),
                value.getMillOperator(),
                value.getPreformerOperator(),
                value.getMaterialConsumedKg(),
                value.getAverageBlankWeightGrams(),
                value.getExpectedBlankQuantity(),
                value.getExpectedWholeBlankQuantity(),
                value.getPlannedProductionQuantity(),
                value.getProductionQuantity(),
                actualGood(value),
                value.getRejectedQuantity(),
                zero(value.getRejectedMaterialWeightKg()),
                zero(value.getActualUsedCompoundWeightKg()),
                zero(value.getRemainingCompoundWeightKg()),
                value.getProductionVariance() == null ? 0 : value.getProductionVariance(),
                value.getExpectedBlankQuantity() != null
                        && value.getExpectedBlankQuantity().stripTrailingZeros().scale() > 0,
                value.isUnbalanced(),
                value.getBalanceConfirmationReason(),
                user(value.getBalanceConfirmedBy()),
                value.getAvailableGoodBlankQuantity(),
                Math.max(0, actualGood(value) - value.getAvailableGoodBlankQuantity()),
                value.getProductionDate(),
                value.getShift(),
                value.getStartTime(),
                value.getEndTime(),
                user(value.getOperator()),
                value.getOperatorEmployeeId(),
                value.getNotes(),
                value.getStatus(),
                value.getCreatedAt(),
                value.getUpdatedAt());
    }

    public static BlankingCartView blankingCart(BlankingCart value) {
        return new BlankingCartView(
                value.getId(),
                value.getCartNumber(),
                value.getBlankingBatch().getId(),
                value.getBlankingBatch().getBatchNumber(),
                value.getBlankingBatch().getMixingBatchNumber(),
                value.getMaterialCode(),
                value.getItemCode(),
                value.getQuantity(),
                value.getRemainingQuantity(),
                value.getReturnedQuantity(),
                value.getAverageBlankWeightGrams(),
                value.getMaterialWeightKg(),
                value.getProductionDate() == null
                        ? value.getBlankingBatch().getProductionDate() : value.getProductionDate(),
                value.getShift() == null ? value.getBlankingBatch().getShift() : value.getShift(),
                value.getCreatedAt(),
                user(value.getCreatedBy()),
                value.getDestinationPress() == null ? null : value.getDestinationPress().getId(),
                value.getDestinationPress() == null ? null : value.getDestinationPress().getPressNumber(),
                value.getDestinationPress() == null ? null : value.getDestinationPress().getPressName(),
                value.getDispatchedAt(),
                user(value.getDispatchedBy()),
                value.getHeldAt(),
                user(value.getHeldBy()),
                value.getHoldReason(),
                value.getReleasedAt(),
                user(value.getReleasedBy()),
                value.getStatus(),
                value.getBlankingNote());
    }

    public static PressView press(Press value, ProductionShift currentShift, long cartsWaiting,
                                  int estimatedNextBlankRequirement) {
        return new PressView(
                value.getId(),
                value.getPressNumber(),
                value.getPressName(),
                value.getStatus(),
                currentShift,
                user(value.getCurrentOperator()),
                value.getCurrentBlankingBatch() == null ? null : value.getCurrentBlankingBatch().getId(),
                value.getCurrentBlankingBatch() == null ? null : value.getCurrentBlankingBatch().getBatchNumber(),
                value.getCurrentItemCode(),
                value.getAvailableBlankQuantity(),
                value.getGoodTyreQuantity(),
                value.getRejectedTyreQuantity(),
                value.getRejectedBlankQuantity(),
                cartsWaiting,
                estimatedNextBlankRequirement,
                value.getLastActivityAt(),
                value.isActive());
    }

    public static CartReceiptView cartReceipt(CartReceipt value) {
        return new CartReceiptView(
                value.getId(),
                value.getReceiptNumber(),
                value.getCart().getId(),
                value.getCart().getCartNumber(),
                value.getCart().getBlankingBatch().getBatchNumber(),
                value.getReceivedQuantity(),
                value.getProductionDate(),
                value.getShift(),
                value.getReceivedAt(),
                user(value.getReceivingOperator()),
                value.getReceivingOperatorEmployeeId(),
                value.getPress().getId(),
                value.getPress().getPressNumber(),
                user(value.getSendingOperator()),
                value.getDispatchTime(),
                value.getReceiptStatus(),
                value.getOverrideReason());
    }

    public static MouldingProductionRecordView mouldingRecord(MouldingProductionRecord value) {
        return new MouldingProductionRecordView(
                value.getId(),
                value.getPress().getId(),
                value.getPress().getPressNumber(),
                value.getProductionDate(),
                value.getShift(),
                value.getStartTime(),
                value.getEndTime(),
                user(value.getOperator()),
                value.getOperatorEmployeeId(),
                value.getCart().getId(),
                value.getCart().getCartNumber(),
                value.getBlankingBatch().getId(),
                value.getBlankingBatch().getBatchNumber(),
                value.getBlankingBatch().getItemCode(),
                value.getBlankingBatch().getMaterialCode(),
                value.getBlankingBatch().getMixingBatchNumber(),
                value.getQuantityReceived(),
                value.getGoodTyreQuantity(),
                value.getRejectedTyreQuantity(),
                value.getRejectedTyreWeightPerItemGrams(),
                value.getTotalRejectedTyreWeightGrams(),
                value.getRejectedBlankQuantity(),
                value.getRemainingBlankQuantity(),
                value.getDowntimeMinutes(),
                value.getDowntimeReason(),
                value.getOperatorNote(),
                value.getStatus(),
                value.getCreatedAt(),
                value.getUpdatedAt());
    }

    public static BlankReturnView blankReturn(BlankReturn value) {
        return new BlankReturnView(
                value.getId(),
                value.getReturnNumber(),
                value.getPress().getId(),
                value.getPress().getPressNumber(),
                value.getCart().getId(),
                value.getCart().getCartNumber(),
                value.getBlankingBatch().getId(),
                value.getBlankingBatch().getBatchNumber(),
                value.getReturnType() == null ? BlankReturnType.UNUSED_GOOD_BLANKS : value.getReturnType(),
                value.getProductionRecord() == null ? null : value.getProductionRecord().getId(),
                value.getCompoundCode(),
                value.getCompoundBatchNumber(),
                value.getItemCode(),
                value.getPreparedQuantity(),
                value.getMeasuredReturnWeightKg(),
                value.getAverageBlankWeightGrams(),
                value.getReturnReason(),
                user(value.getSendingOperator()),
                value.getSendingOperatorEmployeeId() == null
                        ? value.getSendingOperator().getEmployeeId() : value.getSendingOperatorEmployeeId(),
                value.getSendingDateTime(),
                value.getShift(),
                value.getMouldingNote(),
                user(value.getReceivingOperator()),
                value.getReceivingOperatorEmployeeId() == null && value.getReceivingOperator() != null
                        ? value.getReceivingOperator().getEmployeeId() : value.getReceivingOperatorEmployeeId(),
                value.getReceivingDateTime(),
                value.getReceivedQuantity(),
                value.getReceivedWeightKg(),
                value.getQuantityVariance(),
                value.getWeightVarianceKg(),
                value.getVarianceNote(),
                value.getStatus(),
                value.getCreatedAt(),
                value.getUpdatedAt());
    }

    public static InventoryTransactionView inventoryTransaction(InventoryTransaction value) {
        return new InventoryTransactionView(
                value.getId(),
                value.getTransactionType(),
                value.getSourceSection(),
                value.getDestinationSection(),
                value.getSourceRecordType(),
                value.getSourceRecordId(),
                value.getDestinationRecordType(),
                value.getDestinationRecordId(),
                value.getQuantity(),
                value.getUnit(),
                value.getWeightKg(),
                user(value.getActor()),
                value.getTransactionTime(),
                value.getReasonReference());
    }

    public static MaterialShortageRequestView shortageRequest(MaterialShortageRequest value) {
        List<RequestMessageView> messages = value.getMessages().stream()
                .sorted(Comparator.comparing(RequestMessage::getCreatedAt))
                .map(message -> new RequestMessageView(
                        message.getId(),
                        user(message.getSender()),
                        message.getMessage(),
                        message.getStatusSnapshot(),
                        message.getCreatedAt()))
                .toList();
        return new MaterialShortageRequestView(
                value.getId(),
                value.getRequestNumber(),
                value.getPress().getId(),
                value.getPress().getPressNumber(),
                value.getCurrentBlankingBatch() == null ? null : value.getCurrentBlankingBatch().getId(),
                value.getCurrentBlankingBatch() == null ? null : value.getCurrentBlankingBatch().getBatchNumber(),
                value.getCurrentAvailableBlankQuantity(),
                value.getRequestedBlankQuantity(),
                value.getRequiredMaterialCode(),
                value.getRequiredAt(),
                value.getPriority(),
                user(value.getSender()),
                value.getSenderEmployeeId(),
                value.getProductionDate(),
                value.getSenderShift(),
                value.getStatus(),
                value.getLinkedCart() == null ? null : value.getLinkedCart().getId(),
                value.getLinkedCart() == null ? null : value.getLinkedCart().getCartNumber(),
                value.getCreatedAt(),
                value.getUpdatedAt(),
                messages);
    }

    private static BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static int actualGood(BlankingBatch value) {
        if (value.getActualGoodBlankQuantity() != null) {
            return value.getActualGoodBlankQuantity();
        }
        if (value.getProductionQuantity() == null) {
            return 0;
        }
        return Math.max(0, value.getProductionQuantity() - value.getRejectedQuantity());
    }
}

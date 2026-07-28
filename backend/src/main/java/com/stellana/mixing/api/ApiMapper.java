package com.stellana.mixing.api;

import com.stellana.mixing.domain.*;

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
                value.getCreatedAt(), value.getStatus(), value.getCurrentStage(), value.getIssueOrStoppageReason(),
                source == null ? null : source.getId(), source == null ? null : source.getBatchNumber(),
                value.getLaboratoryStatus(), value.getReleaseStatus(), value.getTraceabilityCode(),
                value.getStage1StartedAt(), value.getStage1CompletedAt(), value.getStage2StartedAt(),
                value.getStage2CompletedAt());
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
        return new ApprovedMaterialBatchView(
                value.getId(),
                value.getMixingBatch() == null ? null : value.getMixingBatch().getId(),
                value.getLabApproval() == null ? null : value.getLabApproval().getId(),
                value.getMixingBatchNumber(),
                value.getMaterialCode(),
                value.getCompoundName(),
                value.getLabStatus(),
                value.getApprovedQuantityKg(),
                value.getAvailableQuantityKg(),
                value.getApprovedAt(),
                value.getNotes(),
                value.isActive());
    }

    public static BlankingBatchView blankingBatch(BlankingBatch value) {
        return new BlankingBatchView(
                value.getId(),
                value.getBatchNumber(),
                value.getApprovedMaterialBatch().getId(),
                value.getMixingBatchNumber(),
                value.getMaterialCode(),
                value.getMaterialConsumedKg(),
                value.getPlannedProductionQuantity(),
                value.getProductionQuantity(),
                value.getRejectedQuantity(),
                value.getAvailableGoodBlankQuantity(),
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
                value.getQuantity(),
                value.getRemainingQuantity(),
                value.getCreatedAt(),
                user(value.getCreatedBy()),
                value.getDestinationPress().getId(),
                value.getDestinationPress().getPressNumber(),
                value.getDestinationPress().getPressName(),
                value.getDispatchedAt(),
                user(value.getDispatchedBy()),
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
}

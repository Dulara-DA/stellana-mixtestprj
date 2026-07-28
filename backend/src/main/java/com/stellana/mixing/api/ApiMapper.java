package com.stellana.mixing.api;

import com.stellana.mixing.domain.*;

import java.util.Comparator;
import java.util.List;

import static com.stellana.mixing.api.ApiModels.*;

public final class ApiMapper {
    private ApiMapper() {}

    public static UserView user(UserAccount value) {
        return value == null ? null : new UserView(value.getId(), value.getFullName(), value.getEmail(), value.getRole(), value.isActive());
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
}

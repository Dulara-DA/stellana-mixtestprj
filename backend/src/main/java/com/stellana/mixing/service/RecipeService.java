package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.IngredientInput;
import com.stellana.mixing.api.ApiModels.RecipeRevisionRequest;
import com.stellana.mixing.api.ApiModels.RecipeRevisionView;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.RecipeRepository;
import com.stellana.mixing.repository.RecipeRevisionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static com.stellana.mixing.api.ApiMapper.recipeRevision;

@Service
@RequiredArgsConstructor
public class RecipeService {
    private final RecipeRepository recipeRepository;
    private final RecipeRevisionRepository recipeRevisionRepository;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;
    private final RealtimeEventService realtimeEventService;

    @Transactional(readOnly = true)
    public List<RecipeRevisionView> list() {
        return recipeRevisionRepository.findAllByOrderByUpdatedAtDesc().stream()
                .map(com.stellana.mixing.api.ApiMapper::recipeRevision).toList();
    }

    @Transactional(readOnly = true)
    public List<RecipeRevisionView> active() {
        return recipeRevisionRepository.findAllByStatusOrderByUpdatedAtDesc(RecipeStatus.ACTIVE).stream()
                .map(com.stellana.mixing.api.ApiMapper::recipeRevision).toList();
    }

    @Transactional(readOnly = true)
    public RecipeRevisionView get(Long id) {
        return recipeRevision(requireRevision(id));
    }

    @Transactional
    public RecipeRevisionView createRevision(RecipeRevisionRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        Recipe recipe = recipeRepository.findByRecipeCodeIgnoreCase(request.recipeCode().trim())
                .orElseGet(() -> recipeRepository.save(Recipe.builder()
                        .recipeCode(request.recipeCode().trim().toUpperCase())
                        .compoundName(request.compoundName().trim())
                        .build()));

        if (recipeRevisionRepository.existsByRecipeIdAndRevisionNumberIgnoreCase(recipe.getId(), request.revisionNumber())) {
            throw new BusinessRuleException("Revision " + request.revisionNumber() + " already exists for this recipe.");
        }

        RecipeRevision revision = RecipeRevision.builder()
                .recipe(recipe)
                .revisionNumber(request.revisionNumber().trim())
                .effectiveDate(request.effectiveDate())
                .status(request.status())
                .createdBy(actor)
                .revisionNotes(request.revisionNotes())
                .build();

        for (IngredientInput input : request.ingredients()) {
            revision.addIngredient(RecipeIngredient.builder()
                    .materialCode(input.materialCode().trim().toUpperCase())
                    .materialName(input.materialName().trim())
                    .requiredQuantity(input.requiredQuantity())
                    .unit(input.unit().trim())
                    .additionSequence(input.additionSequence())
                    .stageNumber(input.stageNumber())
                    .mixingTimeSeconds(input.mixingTimeSeconds())
                    .temperatureCelsius(input.temperatureCelsius())
                    .speedRpm(input.speedRpm())
                    .instructions(input.instructions())
                    .build());
        }

        if (request.status() == RecipeStatus.ACTIVE) {
            obsoleteCurrentActive(recipe.getId(), actor);
            revision.setApprovedBy(actor);
            revision.setApprovedAt(LocalDateTime.now());
        }

        RecipeRevision saved = recipeRevisionRepository.save(revision);
        auditService.record(actor, "CREATE_RECIPE_REVISION", "RecipeRevision", saved.getId(), null,
                recipe.getRecipeCode() + " rev " + saved.getRevisionNumber() + " (" + saved.getStatus() + ")",
                null, recipe.getId());
        realtimeEventService.dashboardChanged("RECIPE_CHANGED", saved.getId(),
                recipe.getRecipeCode() + " revision " + saved.getRevisionNumber() + " created");
        return recipeRevision(saved);
    }

    @Transactional
    public RecipeRevisionView changeStatus(Long id, RecipeStatus status) {
        UserAccount actor = currentUserService.requireCurrentUser();
        RecipeRevision revision = requireRevision(id);
        RecipeStatus previous = revision.getStatus();
        if (previous == status) {
            return recipeRevision(revision);
        }
        if (previous == RecipeStatus.OBSOLETE && status != RecipeStatus.OBSOLETE) {
            throw new BusinessRuleException("An obsolete recipe revision cannot be reactivated. Create a new revision.");
        }
        if (status == RecipeStatus.ACTIVE) {
            obsoleteCurrentActive(revision.getRecipe().getId(), actor);
            revision.setApprovedBy(actor);
            revision.setApprovedAt(LocalDateTime.now());
        }
        revision.setStatus(status);
        RecipeRevision saved = recipeRevisionRepository.save(revision);
        auditService.record(actor, "CHANGE_RECIPE_STATUS", "RecipeRevision", id,
                previous.name(), status.name(), null, revision.getRecipe().getId());
        realtimeEventService.dashboardChanged("RECIPE_CHANGED", id,
                revision.getRecipe().getRecipeCode() + " revision status changed to " + status);
        return recipeRevision(saved);
    }

    private void obsoleteCurrentActive(Long recipeId, UserAccount actor) {
        recipeRevisionRepository.findAllByRecipeIdAndStatus(recipeId, RecipeStatus.ACTIVE)
                .forEach(active -> {
                    active.setStatus(RecipeStatus.OBSOLETE);
                    recipeRevisionRepository.save(active);
                    auditService.record(actor, "OBSOLETE_RECIPE_REVISION", "RecipeRevision", active.getId(),
                            RecipeStatus.ACTIVE.name(), RecipeStatus.OBSOLETE.name(), null, recipeId);
                });
    }

    public RecipeRevision requireRevision(Long id) {
        return recipeRevisionRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Recipe revision not found."));
    }
}


package com.stellana.mixing.repository;

import com.stellana.mixing.domain.RecipeRevision;
import com.stellana.mixing.domain.RecipeStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecipeRevisionRepository extends JpaRepository<RecipeRevision, Long> {
    @EntityGraph(attributePaths = {"recipe", "createdBy", "approvedBy", "ingredients"})
    List<RecipeRevision> findAllByOrderByUpdatedAtDesc();

    @Override
    @EntityGraph(attributePaths = {"recipe", "createdBy", "approvedBy", "ingredients"})
    Optional<RecipeRevision> findById(Long id);

    @EntityGraph(attributePaths = {"recipe", "ingredients"})
    List<RecipeRevision> findAllByStatusOrderByUpdatedAtDesc(RecipeStatus status);

    List<RecipeRevision> findAllByRecipeIdAndStatus(Long recipeId, RecipeStatus status);

    boolean existsByRecipeIdAndRevisionNumberIgnoreCase(Long recipeId, String revisionNumber);
}


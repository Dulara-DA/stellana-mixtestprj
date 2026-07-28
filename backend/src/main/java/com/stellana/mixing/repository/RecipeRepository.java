package com.stellana.mixing.repository;

import com.stellana.mixing.domain.Recipe;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RecipeRepository extends JpaRepository<Recipe, Long> {
    Optional<Recipe> findByRecipeCodeIgnoreCase(String recipeCode);
    List<Recipe> findAllByArchivedFalseOrderByRecipeCodeAsc();
}


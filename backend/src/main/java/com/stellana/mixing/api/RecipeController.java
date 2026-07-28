package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.RecipeRevisionRequest;
import com.stellana.mixing.api.ApiModels.RecipeRevisionView;
import com.stellana.mixing.api.ApiModels.RecipeStatusRequest;
import com.stellana.mixing.service.RecipeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/recipes")
@RequiredArgsConstructor
public class RecipeController {
    private final RecipeService recipeService;

    @GetMapping
    public List<RecipeRevisionView> list() {
        return recipeService.list();
    }

    @GetMapping("/active")
    public List<RecipeRevisionView> active() {
        return recipeService.active();
    }

    @GetMapping("/{id}")
    public RecipeRevisionView get(@PathVariable Long id) {
        return recipeService.get(id);
    }

    @PostMapping("/revisions")
    @PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN')")
    public RecipeRevisionView create(@Valid @RequestBody RecipeRevisionRequest request) {
        return recipeService.createRevision(request);
    }

    @PatchMapping("/revisions/{id}/status")
    @PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN')")
    public RecipeRevisionView status(@PathVariable Long id, @Valid @RequestBody RecipeStatusRequest request) {
        return recipeService.changeStatus(id, request.status());
    }
}


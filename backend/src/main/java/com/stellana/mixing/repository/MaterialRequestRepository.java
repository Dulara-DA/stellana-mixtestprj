package com.stellana.mixing.repository;

import com.stellana.mixing.domain.MaterialRequest;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MaterialRequestRepository extends JpaRepository<MaterialRequest, Long> {
    @Override
    @EntityGraph(attributePaths = {"batch", "batch.recipeRevision", "batch.recipeRevision.recipe", "requestingOfficer", "issuedBy", "items"})
    Optional<MaterialRequest> findById(Long id);

    @EntityGraph(attributePaths = {"batch", "batch.recipeRevision", "batch.recipeRevision.recipe", "requestingOfficer", "issuedBy", "items"})
    List<MaterialRequest> findAllByOrderByRequestedAtDesc();

    @EntityGraph(attributePaths = {"batch", "requestingOfficer", "items"})
    List<MaterialRequest> findAllByBatchIdOrderByRequestedAtDesc(Long batchId);
}


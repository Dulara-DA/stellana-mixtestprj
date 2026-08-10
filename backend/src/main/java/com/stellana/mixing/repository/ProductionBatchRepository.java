package com.stellana.mixing.repository;

import com.stellana.mixing.domain.BatchStatus;
import com.stellana.mixing.domain.LabDecision;
import com.stellana.mixing.domain.ProductionBatch;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ProductionBatchRepository extends JpaRepository<ProductionBatch, Long> {
    @Override
    @EntityGraph(attributePaths = {"recipeRevision", "recipeRevision.recipe", "assignedOfficer", "reprocessingSourceBatch", "scheduledBy"})
    Optional<ProductionBatch> findById(Long id);

    @EntityGraph(attributePaths = {"recipeRevision", "recipeRevision.recipe", "assignedOfficer", "scheduledBy"})
    Optional<ProductionBatch> findByTraceabilityCode(String traceabilityCode);

    @EntityGraph(attributePaths = {"recipeRevision", "recipeRevision.recipe", "assignedOfficer", "scheduledBy"})
    List<ProductionBatch> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"recipeRevision", "recipeRevision.recipe", "assignedOfficer", "scheduledBy"})
    List<ProductionBatch> findAllByStatusInOrderByUpdatedAtDesc(Collection<BatchStatus> statuses);

    @EntityGraph(attributePaths = {"recipeRevision", "recipeRevision.recipe", "assignedOfficer", "scheduledBy"})
    List<ProductionBatch> findAllByAssignedOfficerIdOrderByCreatedAtDesc(Long officerId);

    @EntityGraph(attributePaths = {"recipeRevision", "recipeRevision.recipe", "assignedOfficer", "scheduledBy"})
    List<ProductionBatch> findAllByLaboratoryStatusOrderByCreatedAtDesc(LabDecision laboratoryStatus);

    boolean existsByBatchNumberIgnoreCase(String batchNumber);
}

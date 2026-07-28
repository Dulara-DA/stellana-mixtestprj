package com.stellana.mixing.repository;

import com.stellana.mixing.domain.LabSample;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface LabSampleRepository extends JpaRepository<LabSample, Long> {
    @Override
    @EntityGraph(attributePaths = {"batch", "batch.recipeRevision", "batch.recipeRevision.recipe", "testedBy", "managerApprovedBy", "additionalResults"})
    Optional<LabSample> findById(Long id);

    @EntityGraph(attributePaths = {"batch", "batch.recipeRevision", "batch.recipeRevision.recipe", "testedBy", "managerApprovedBy", "additionalResults"})
    List<LabSample> findAllByOrderBySentToLabAtDesc();

    @EntityGraph(attributePaths = {"batch", "testedBy", "managerApprovedBy", "additionalResults"})
    Optional<LabSample> findFirstByBatchIdOrderBySentToLabAtDesc(Long batchId);
}


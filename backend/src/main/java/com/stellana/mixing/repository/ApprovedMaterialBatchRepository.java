package com.stellana.mixing.repository;

import com.stellana.mixing.domain.ApprovedMaterialBatch;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ApprovedMaterialBatchRepository extends JpaRepository<ApprovedMaterialBatch, Long> {
    @EntityGraph(attributePaths = {"mixingBatch", "mixingBatch.recipeRevision", "mixingBatch.recipeRevision.recipe", "labApproval"})
    List<ApprovedMaterialBatch> findAllByOrderByApprovedAtDesc();

    boolean existsByMixingBatchId(Long mixingBatchId);

    Optional<ApprovedMaterialBatch> findByMixingBatchNumberIgnoreCase(String mixingBatchNumber);
}

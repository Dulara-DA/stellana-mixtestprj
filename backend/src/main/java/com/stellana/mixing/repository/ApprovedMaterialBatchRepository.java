package com.stellana.mixing.repository;

import com.stellana.mixing.domain.ApprovedMaterialBatch;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface ApprovedMaterialBatchRepository extends JpaRepository<ApprovedMaterialBatch, Long> {
    @EntityGraph(attributePaths = {"mixingBatch", "mixingBatch.recipeRevision", "mixingBatch.recipeRevision.recipe",
            "mixingBatch.temporaryLabBypassApprovedBy", "labApproval"})
    List<ApprovedMaterialBatch> findAllByOrderByApprovedAtDesc();

    boolean existsByMixingBatchId(Long mixingBatchId);

    Optional<ApprovedMaterialBatch> findByMixingBatchNumberIgnoreCase(String mixingBatchNumber);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from ApprovedMaterialBatch value where value.id = :id")
    Optional<ApprovedMaterialBatch> findByIdForUpdate(@Param("id") Long id);
}

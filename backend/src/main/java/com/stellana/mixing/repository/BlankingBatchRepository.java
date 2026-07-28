package com.stellana.mixing.repository;

import com.stellana.mixing.domain.BlankingBatch;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface BlankingBatchRepository extends JpaRepository<BlankingBatch, Long> {
    @EntityGraph(attributePaths = {"approvedMaterialBatch", "operator"})
    List<BlankingBatch> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"approvedMaterialBatch", "operator"})
    List<BlankingBatch> findAllByProductionDateBetweenOrderByCreatedAtDesc(LocalDate from, LocalDate to);

    boolean existsByBatchNumberIgnoreCase(String batchNumber);
}

package com.stellana.mixing.repository;

import com.stellana.mixing.domain.BlankingBatch;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.time.LocalDate;
import java.util.List;

public interface BlankingBatchRepository extends JpaRepository<BlankingBatch, Long> {
    @EntityGraph(attributePaths = {"approvedMaterialBatch", "operator"})
    List<BlankingBatch> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"approvedMaterialBatch", "operator"})
    List<BlankingBatch> findAllByProductionDateBetweenOrderByCreatedAtDesc(LocalDate from, LocalDate to);

    boolean existsByBatchNumberIgnoreCase(String batchNumber);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from BlankingBatch value where value.id = :id")
    java.util.Optional<BlankingBatch> findByIdForUpdate(@Param("id") Long id);
}

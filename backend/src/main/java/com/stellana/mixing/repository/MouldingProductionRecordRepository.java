package com.stellana.mixing.repository;

import com.stellana.mixing.domain.MouldingProductionRecord;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface MouldingProductionRecordRepository extends JpaRepository<MouldingProductionRecord, Long> {
    @EntityGraph(attributePaths = {"press", "operator", "cart", "blankingBatch"})
    List<MouldingProductionRecord> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"press", "operator", "cart", "blankingBatch"})
    List<MouldingProductionRecord> findAllByProductionDateBetweenOrderByCreatedAtDesc(LocalDate from, LocalDate to);

    @EntityGraph(attributePaths = {"press", "operator", "cart", "blankingBatch"})
    Optional<MouldingProductionRecord> findFirstByCartIdAndEndTimeIsNull(Long cartId);
}

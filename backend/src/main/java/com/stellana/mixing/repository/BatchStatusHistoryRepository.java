package com.stellana.mixing.repository;

import com.stellana.mixing.domain.BatchStatusHistory;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BatchStatusHistoryRepository extends JpaRepository<BatchStatusHistory, Long> {
    @EntityGraph(attributePaths = {"changedBy"})
    List<BatchStatusHistory> findAllByBatchIdOrderByChangedAtAsc(Long batchId);
}


package com.stellana.mixing.repository;

import com.stellana.mixing.domain.InventoryTransaction;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InventoryTransactionRepository extends JpaRepository<InventoryTransaction, Long> {
    @EntityGraph(attributePaths = "actor")
    List<InventoryTransaction> findTop200ByOrderByTransactionTimeDesc();

    @EntityGraph(attributePaths = "actor")
    List<InventoryTransaction> findAllByOrderByTransactionTimeAsc();

    @EntityGraph(attributePaths = "actor")
    List<InventoryTransaction> findAllBySourceRecordTypeAndSourceRecordIdOrderByTransactionTimeAsc(
            String sourceRecordType, Long sourceRecordId);

    @EntityGraph(attributePaths = "actor")
    List<InventoryTransaction> findAllByDestinationRecordTypeAndDestinationRecordIdOrderByTransactionTimeAsc(
            String destinationRecordType, Long destinationRecordId);
}

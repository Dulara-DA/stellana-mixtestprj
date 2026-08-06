package com.stellana.mixing.repository;

import com.stellana.mixing.domain.BlankingCart;
import com.stellana.mixing.domain.BlankingCartStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.Collection;
import java.util.List;

public interface BlankingCartRepository extends JpaRepository<BlankingCart, Long> {
    @EntityGraph(attributePaths = {"blankingBatch", "createdBy", "destinationPress", "dispatchedBy"})
    List<BlankingCart> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {"blankingBatch", "createdBy", "destinationPress", "dispatchedBy"})
    List<BlankingCart> findAllByStatusInOrderByCreatedAtDesc(Collection<BlankingCartStatus> statuses);

    @EntityGraph(attributePaths = {"blankingBatch", "createdBy", "destinationPress", "dispatchedBy"})
    List<BlankingCart> findAllByBlankingBatchIdOrderByCreatedAtAsc(Long blankingBatchId);

    boolean existsByCartNumberIgnoreCase(String cartNumber);

    long countByDestinationPressIdAndStatus(Long pressId, BlankingCartStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from BlankingCart value where value.id = :id")
    java.util.Optional<BlankingCart> findByIdForUpdate(@Param("id") Long id);
}

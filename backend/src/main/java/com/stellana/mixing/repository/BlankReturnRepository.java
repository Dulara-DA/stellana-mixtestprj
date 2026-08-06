package com.stellana.mixing.repository;

import com.stellana.mixing.domain.BlankReturn;
import com.stellana.mixing.domain.BlankReturnStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface BlankReturnRepository extends JpaRepository<BlankReturn, Long> {
    boolean existsByReturnNumberIgnoreCase(String returnNumber);

    @EntityGraph(attributePaths = {
            "press", "cart", "cart.createdBy", "cart.destinationPress", "blankingBatch",
            "sendingOperator", "receivingOperator"
    })
    List<BlankReturn> findAllByOrderByCreatedAtDesc();

    @EntityGraph(attributePaths = {
            "press", "cart", "cart.createdBy", "cart.destinationPress", "blankingBatch",
            "sendingOperator", "receivingOperator"
    })
    List<BlankReturn> findAllByStatusInOrderByCreatedAtDesc(Collection<BlankReturnStatus> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from BlankReturn value where value.id = :id")
    Optional<BlankReturn> findByIdForUpdate(@Param("id") Long id);
}

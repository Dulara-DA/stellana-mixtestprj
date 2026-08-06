package com.stellana.mixing.repository;

import com.stellana.mixing.domain.Press;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface PressRepository extends JpaRepository<Press, Long> {
    @EntityGraph(attributePaths = {"currentOperator", "currentBlankingBatch"})
    List<Press> findAllByActiveTrueOrderByPressNumberAsc();

    Optional<Press> findByPressNumberIgnoreCase(String pressNumber);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from Press value where value.id = :id")
    Optional<Press> findByIdForUpdate(@Param("id") Long id);
}

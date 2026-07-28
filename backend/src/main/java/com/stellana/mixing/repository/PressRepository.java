package com.stellana.mixing.repository;

import com.stellana.mixing.domain.Press;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PressRepository extends JpaRepository<Press, Long> {
    @EntityGraph(attributePaths = {"currentOperator", "currentBlankingBatch"})
    List<Press> findAllByActiveTrueOrderByPressNumberAsc();

    Optional<Press> findByPressNumberIgnoreCase(String pressNumber);
}

package com.stellana.mixing.repository;

import com.stellana.mixing.domain.TestSpecification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TestSpecificationRepository extends JpaRepository<TestSpecification, Long> {
    @EntityGraph(attributePaths = {"recipe"})
    List<TestSpecification> findAllByActiveTrueOrderByTestNameAsc();
}


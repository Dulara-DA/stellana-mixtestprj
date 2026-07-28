package com.stellana.mixing.repository;

import com.stellana.mixing.domain.MaterialShortageRequest;
import com.stellana.mixing.domain.ShortageStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MaterialShortageRequestRepository extends JpaRepository<MaterialShortageRequest, Long> {
    @EntityGraph(attributePaths = {
            "press", "currentBlankingBatch", "sender", "linkedCart",
            "linkedCart.blankingBatch", "messages", "messages.sender"
    })
    List<MaterialShortageRequest> findAllByOrderByCreatedAtDesc();

    long countByStatusIn(Collection<ShortageStatus> statuses);

    boolean existsByRequestNumberIgnoreCase(String requestNumber);

    Optional<MaterialShortageRequest> findFirstByLinkedCartId(Long cartId);
}

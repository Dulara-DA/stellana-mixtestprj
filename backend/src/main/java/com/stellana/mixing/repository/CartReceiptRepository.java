package com.stellana.mixing.repository;

import com.stellana.mixing.domain.CartReceipt;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CartReceiptRepository extends JpaRepository<CartReceipt, Long> {
    boolean existsByCartId(Long cartId);

    @EntityGraph(attributePaths = {"cart", "cart.blankingBatch", "receivingOperator", "press", "sendingOperator"})
    Optional<CartReceipt> findByCartId(Long cartId);

    @EntityGraph(attributePaths = {"cart", "cart.blankingBatch", "receivingOperator", "press", "sendingOperator"})
    List<CartReceipt> findAllByOrderByReceivedAtDesc();
}

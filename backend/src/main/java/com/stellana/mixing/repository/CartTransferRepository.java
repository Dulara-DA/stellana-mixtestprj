package com.stellana.mixing.repository;

import com.stellana.mixing.domain.CartTransfer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CartTransferRepository extends JpaRepository<CartTransfer, Long> {
    Optional<CartTransfer> findByCartId(Long cartId);
    boolean existsByCartId(Long cartId);
}

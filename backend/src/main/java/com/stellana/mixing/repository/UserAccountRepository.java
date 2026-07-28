package com.stellana.mixing.repository;

import com.stellana.mixing.domain.Role;
import com.stellana.mixing.domain.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    Optional<UserAccount> findByEmailIgnoreCase(String email);
    List<UserAccount> findAllByRoleAndActiveTrue(Role role);
    boolean existsByEmailIgnoreCase(String email);
}


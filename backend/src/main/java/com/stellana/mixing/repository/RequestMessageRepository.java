package com.stellana.mixing.repository;

import com.stellana.mixing.domain.RequestMessage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RequestMessageRepository extends JpaRepository<RequestMessage, Long> {
}

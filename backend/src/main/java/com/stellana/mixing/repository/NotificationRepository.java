package com.stellana.mixing.repository;

import com.stellana.mixing.domain.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findAllByRecipientIdOrderByCreatedAtDesc(Long recipientId);
    long countByRecipientIdAndReadFlagFalse(Long recipientId);
}


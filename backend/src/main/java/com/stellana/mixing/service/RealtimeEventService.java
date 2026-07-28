package com.stellana.mixing.service;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class RealtimeEventService {
    private final SimpMessagingTemplate messagingTemplate;

    public void dashboardChanged(String eventType, Long referenceId, String message) {
        messagingTemplate.convertAndSend("/topic/dashboard", Map.of(
                "eventType", eventType,
                "referenceId", referenceId == null ? 0 : referenceId,
                "message", message,
                "timestamp", LocalDateTime.now().toString()));
    }

    public void issuesChanged(String eventType, Long issueId, String message) {
        messagingTemplate.convertAndSend("/topic/issues", Map.of(
                "eventType", eventType,
                "referenceId", issueId,
                "message", message,
                "timestamp", LocalDateTime.now().toString()));
    }

    public void notificationsChanged(Long recipientId) {
        messagingTemplate.convertAndSend("/topic/notifications/" + recipientId, Map.of(
                "eventType", "NOTIFICATIONS_CHANGED",
                "timestamp", LocalDateTime.now().toString()));
    }

    public void productionChanged(String section, String eventType, Long referenceId, String message) {
        Map<String, Object> payload = Map.of(
                "section", section,
                "eventType", eventType,
                "referenceId", referenceId == null ? 0 : referenceId,
                "message", message,
                "timestamp", LocalDateTime.now().toString());
        messagingTemplate.convertAndSend("/topic/production", payload);
        messagingTemplate.convertAndSend("/topic/" + section.toLowerCase(), payload);
    }

    public void shortagesChanged(String eventType, Long requestId, String message) {
        Map<String, Object> payload = Map.of(
                "section", "SHORTAGE",
                "eventType", eventType,
                "referenceId", requestId == null ? 0 : requestId,
                "message", message,
                "timestamp", LocalDateTime.now().toString());
        messagingTemplate.convertAndSend("/topic/production", payload);
        messagingTemplate.convertAndSend("/topic/shortages", payload);
    }
}

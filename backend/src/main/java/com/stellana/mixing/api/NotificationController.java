package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.NotificationView;
import com.stellana.mixing.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {
    private final NotificationService notificationService;

    @GetMapping
    public List<NotificationView> mine() {
        return notificationService.mine();
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount() {
        return Map.of("count", notificationService.unreadCount());
    }

    @PostMapping("/{id}/read")
    public NotificationView read(@PathVariable Long id) {
        return notificationService.markRead(id);
    }
}


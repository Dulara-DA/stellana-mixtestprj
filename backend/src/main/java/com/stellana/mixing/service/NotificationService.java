package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.NotificationView;
import com.stellana.mixing.domain.Notification;
import com.stellana.mixing.domain.NotificationType;
import com.stellana.mixing.domain.Role;
import com.stellana.mixing.domain.UserAccount;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.NotificationRepository;
import com.stellana.mixing.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static com.stellana.mixing.api.ApiMapper.notification;

@Service
@RequiredArgsConstructor
public class NotificationService {
    private final NotificationRepository notificationRepository;
    private final UserAccountRepository userAccountRepository;
    private final CurrentUserService currentUserService;
    private final RealtimeEventService realtimeEventService;

    @Transactional
    public void notifyRole(Role role, NotificationType type, String title, String message,
                           String referenceType, Long referenceId) {
        userAccountRepository.findAllByRoleAndActiveTrue(role)
                .forEach(user -> create(user, type, title, message, referenceType, referenceId));
    }

    @Transactional
    public void notifyUser(UserAccount user, NotificationType type, String title, String message,
                           String referenceType, Long referenceId) {
        create(user, type, title, message, referenceType, referenceId);
    }

    private void create(UserAccount recipient, NotificationType type, String title, String message,
                        String referenceType, Long referenceId) {
        notificationRepository.save(Notification.builder()
                .recipient(recipient)
                .type(type)
                .title(title)
                .message(message)
                .referenceType(referenceType)
                .referenceId(referenceId)
                .build());
        realtimeEventService.notificationsChanged(recipient.getId());
    }

    @Transactional(readOnly = true)
    public List<NotificationView> mine() {
        UserAccount user = currentUserService.requireCurrentUser();
        return notificationRepository.findAllByRecipientIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(com.stellana.mixing.api.ApiMapper::notification).toList();
    }

    public long unreadCount() {
        return notificationRepository.countByRecipientIdAndReadFlagFalse(currentUserService.requireCurrentUser().getId());
    }

    @Transactional
    public NotificationView markRead(Long id) {
        UserAccount user = currentUserService.requireCurrentUser();
        Notification value = notificationRepository.findById(id)
                .filter(n -> n.getRecipient().getId().equals(user.getId()))
                .orElseThrow(() -> new NotFoundException("Notification not found."));
        value.setReadFlag(true);
        return notification(notificationRepository.save(value));
    }
}


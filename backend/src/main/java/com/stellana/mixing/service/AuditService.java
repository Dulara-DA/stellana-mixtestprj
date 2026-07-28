package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.AuditView;
import com.stellana.mixing.domain.AuditLog;
import com.stellana.mixing.domain.UserAccount;
import com.stellana.mixing.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static com.stellana.mixing.api.ApiMapper.audit;

@Service
@RequiredArgsConstructor
public class AuditService {
    private final AuditLogRepository auditLogRepository;

    public void record(UserAccount actor, String action, String entityType, Long entityId,
                       String previousValue, String newValue, Long batchId, Long recipeId) {
        auditLogRepository.save(AuditLog.builder()
                .actor(actor)
                .action(action)
                .entityType(entityType)
                .entityId(entityId)
                .previousValue(previousValue)
                .newValue(newValue)
                .actionTime(LocalDateTime.now())
                .relatedBatchId(batchId)
                .relatedRecipeId(recipeId)
                .build());
    }

    @Transactional(readOnly = true)
    public List<AuditView> recent(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 200));
        return auditLogRepository.findAll(PageRequest.of(0, safeLimit, Sort.by(Sort.Direction.DESC, "actionTime")))
                .stream().map(com.stellana.mixing.api.ApiMapper::audit).toList();
    }
}


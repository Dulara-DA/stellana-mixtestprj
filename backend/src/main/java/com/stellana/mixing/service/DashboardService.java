package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.BatchView;
import com.stellana.mixing.api.ApiModels.DashboardSummary;
import com.stellana.mixing.domain.BatchStatus;
import com.stellana.mixing.domain.ProductionBatch;
import com.stellana.mixing.domain.Role;
import com.stellana.mixing.domain.UserAccount;
import com.stellana.mixing.repository.IssueThreadRepository;
import com.stellana.mixing.repository.ProductionBatchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class DashboardService {
    private static final Set<BatchStatus> ACTIVE = EnumSet.of(
            BatchStatus.STAGE_1_IN_PROGRESS, BatchStatus.STAGE_2_IN_PROGRESS);

    private final ProductionBatchRepository batchRepository;
    private final IssueThreadRepository issueRepository;
    private final AuditService auditService;
    private final CurrentUserService currentUserService;

    @Transactional(readOnly = true)
    public DashboardSummary summary() {
        UserAccount current = currentUserService.requireCurrentUser();
        List<ProductionBatch> all = current.getRole() == Role.MIXING_OFFICER
                ? batchRepository.findAllByAssignedOfficerIdOrderByCreatedAtDesc(current.getId())
                : batchRepository.findAllByOrderByCreatedAtDesc();
        List<BatchView> active = all.stream().filter(batch -> ACTIVE.contains(batch.getStatus()))
                .map(com.stellana.mixing.api.ApiMapper::batch).toList();
        List<BatchView> batchBoard = all.stream()
                .limit(25)
                .map(com.stellana.mixing.api.ApiMapper::batch)
                .toList();
        return new DashboardSummary(
                active.size(),
                count(all, BatchStatus.WAITING_FOR_MATERIALS, BatchStatus.MATERIALS_REQUESTED),
                count(all, BatchStatus.SAMPLE_SENT_TO_LAB, BatchStatus.WAITING_FOR_LAB, BatchStatus.RETEST_REQUIRED),
                count(all, BatchStatus.LAB_PASSED, BatchStatus.RELEASED_TO_BLANKING),
                count(all, BatchStatus.LAB_FAILED, BatchStatus.REPROCESSING),
                count(all, BatchStatus.STOPPED, BatchStatus.ON_HOLD),
                current.getRole() == Role.MIXING_OFFICER
                        ? issueRepository.countByCreatedByIdAndUnreadByOfficerTrue(current.getId())
                        : issueRepository.countByUnreadByManagerTrue(),
                active,
                batchBoard,
                auditService.recent(12)
        );
    }

    private long count(List<ProductionBatch> values, BatchStatus... statuses) {
        Set<BatchStatus> expected = EnumSet.noneOf(BatchStatus.class);
        expected.addAll(List.of(statuses));
        return values.stream().filter(value -> expected.contains(value.getStatus())).count();
    }
}

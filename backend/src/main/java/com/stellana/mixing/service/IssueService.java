package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.domain.*;
import com.stellana.mixing.exception.BusinessRuleException;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.IssueThreadRepository;
import com.stellana.mixing.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static com.stellana.mixing.api.ApiMapper.issue;

@Service
@RequiredArgsConstructor
public class IssueService {
    private final IssueThreadRepository issueRepository;
    private final UserAccountRepository userAccountRepository;
    private final BatchService batchService;
    private final CurrentUserService currentUserService;
    private final AuditService auditService;
    private final NotificationService notificationService;
    private final RealtimeEventService realtimeEventService;

    @Transactional(readOnly = true)
    public List<IssueView> list() {
        UserAccount actor = currentUserService.requireCurrentUser();
        List<IssueThread> issues = actor.getRole() == Role.MIXING_OFFICER
                ? issueRepository.findAllByCreatedByIdOrderByUpdatedAtDesc(actor.getId())
                : issueRepository.findAllByOrderByUpdatedAtDesc();
        return issues.stream().map(com.stellana.mixing.api.ApiMapper::issue).toList();
    }

    @Transactional
    public IssueView create(CreateIssueRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        ProductionBatch batch = request.batchId() == null ? null : batchService.requireBatch(request.batchId());
        if (actor.getRole() == Role.MIXING_OFFICER && batch != null
                && !batch.getAssignedOfficer().getId().equals(actor.getId())) {
            throw new BusinessRuleException("You can report an issue only for an assigned batch.");
        }
        UserAccount manager = userAccountRepository.findAllByRoleAndActiveTrue(Role.MANAGER).stream()
                .findFirst().orElse(null);
        IssueThread value = IssueThread.builder()
                .batch(batch)
                .priority(request.priority())
                .subject(request.subject().trim())
                .status(IssueStatus.OPEN)
                .createdBy(actor)
                .assignedManager(manager)
                .unreadByManager(true)
                .build();
        value.addMessage(IssueMessage.builder()
                .sender(actor)
                .message(request.message().trim())
                .build());
        IssueThread saved = issueRepository.save(value);
        auditService.record(actor, "CREATE_ISSUE", "IssueThread", saved.getId(), null,
                saved.getPriority() + " — " + saved.getSubject(),
                batch == null ? null : batch.getId(),
                batch == null ? null : batch.getRecipeRevision().getRecipe().getId());
        notificationService.notifyRole(Role.MANAGER, NotificationType.ISSUE_CREATED, "New " + saved.getPriority() + " issue",
                saved.getSubject(), "ISSUE", saved.getId());
        realtimeEventService.issuesChanged("ISSUE_CREATED", saved.getId(), saved.getSubject());
        realtimeEventService.dashboardChanged("ISSUE_CREATED", saved.getId(), saved.getSubject());
        return issue(saved);
    }

    @Transactional
    public IssueView reply(Long id, IssueReplyRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        IssueThread value = requireIssue(id);
        assertParticipant(value, actor);
        if (value.getStatus() == IssueStatus.CLOSED) {
            throw new BusinessRuleException("A closed issue cannot receive new replies.");
        }
        value.addMessage(IssueMessage.builder().sender(actor).message(request.message().trim()).build());
        boolean fromOfficer = actor.getRole() == Role.MIXING_OFFICER;
        value.setUnreadByManager(fromOfficer);
        value.setUnreadByOfficer(!fromOfficer);
        if (!fromOfficer && value.getStatus() == IssueStatus.OPEN) {
            value.setStatus(IssueStatus.ACKNOWLEDGED);
        }
        IssueThread saved = issueRepository.save(value);
        auditService.record(actor, "REPLY_TO_ISSUE", "IssueThread", saved.getId(), null,
                "Reply added", saved.getBatch() == null ? null : saved.getBatch().getId(),
                saved.getBatch() == null ? null : saved.getBatch().getRecipeRevision().getRecipe().getId());
        if (fromOfficer) {
            notificationService.notifyRole(Role.MANAGER, NotificationType.ISSUE_REPLY,
                    "Issue reply from Mixing Officer", saved.getSubject(), "ISSUE", saved.getId());
        } else {
            notificationService.notifyUser(saved.getCreatedBy(), NotificationType.ISSUE_REPLY,
                    "Manager replied to your issue", saved.getSubject(), "ISSUE", saved.getId());
        }
        realtimeEventService.issuesChanged("ISSUE_REPLY", saved.getId(), saved.getSubject());
        return issue(saved);
    }

    @Transactional
    public IssueView changeStatus(Long id, IssueStatusRequest request) {
        UserAccount actor = currentUserService.requireCurrentUser();
        IssueThread value = requireIssue(id);
        assertParticipant(value, actor);
        IssueStatus previous = value.getStatus();
        value.setStatus(request.status());
        if (actor.getRole() == Role.MIXING_OFFICER) {
            value.setUnreadByManager(true);
        } else {
            value.setUnreadByOfficer(true);
        }
        IssueThread saved = issueRepository.save(value);
        auditService.record(actor, "CHANGE_ISSUE_STATUS", "IssueThread", id,
                previous.name(), request.status().name(),
                saved.getBatch() == null ? null : saved.getBatch().getId(),
                saved.getBatch() == null ? null : saved.getBatch().getRecipeRevision().getRecipe().getId());
        realtimeEventService.issuesChanged("ISSUE_STATUS_CHANGED", id, saved.getSubject());
        return issue(saved);
    }

    @Transactional
    public IssueView markRead(Long id) {
        UserAccount actor = currentUserService.requireCurrentUser();
        IssueThread value = requireIssue(id);
        assertParticipant(value, actor);
        if (actor.getRole() == Role.MIXING_OFFICER) {
            value.setUnreadByOfficer(false);
        } else {
            value.setUnreadByManager(false);
        }
        return issue(issueRepository.save(value));
    }

    private IssueThread requireIssue(Long id) {
        return issueRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Issue not found."));
    }

    private void assertParticipant(IssueThread issue, UserAccount actor) {
        if (actor.getRole() == Role.MIXING_OFFICER && !issue.getCreatedBy().getId().equals(actor.getId())) {
            throw new BusinessRuleException("This issue is not available to the current officer.");
        }
    }
}


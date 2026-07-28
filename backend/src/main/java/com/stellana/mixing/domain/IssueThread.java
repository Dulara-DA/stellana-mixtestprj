package com.stellana.mixing.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "issue_threads")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueThread extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "batch_id")
    private ProductionBatch batch;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IssuePriority priority;

    @Column(nullable = false)
    private String subject;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IssueStatus status;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by_id", nullable = false)
    private UserAccount createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_manager_id")
    private UserAccount assignedManager;

    @Column(nullable = false)
    @Builder.Default
    private boolean unreadByManager = true;

    @Column(nullable = false)
    @Builder.Default
    private boolean unreadByOfficer = false;

    @OneToMany(mappedBy = "issueThread", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<IssueMessage> messages = new ArrayList<>();

    public void addMessage(IssueMessage message) {
        messages.add(message);
        message.setIssueThread(this);
    }
}


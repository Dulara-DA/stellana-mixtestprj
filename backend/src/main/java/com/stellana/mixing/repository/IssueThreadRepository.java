package com.stellana.mixing.repository;

import com.stellana.mixing.domain.IssueThread;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface IssueThreadRepository extends JpaRepository<IssueThread, Long> {
    @Override
    @EntityGraph(attributePaths = {"batch", "createdBy", "assignedManager", "messages", "messages.sender"})
    Optional<IssueThread> findById(Long id);

    @EntityGraph(attributePaths = {"batch", "createdBy", "assignedManager", "messages", "messages.sender"})
    List<IssueThread> findAllByOrderByUpdatedAtDesc();

    @EntityGraph(attributePaths = {"batch", "createdBy", "assignedManager", "messages", "messages.sender"})
    List<IssueThread> findAllByCreatedByIdOrderByUpdatedAtDesc(Long createdById);

    long countByUnreadByManagerTrue();
    long countByCreatedByIdAndUnreadByOfficerTrue(Long createdById);
}

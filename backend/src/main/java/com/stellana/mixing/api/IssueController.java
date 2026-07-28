package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.IssueService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/issues")
@RequiredArgsConstructor
public class IssueController {
    private final IssueService issueService;

    @GetMapping
    public List<IssueView> list() {
        return issueService.list();
    }

    @PostMapping
    public IssueView create(@Valid @RequestBody CreateIssueRequest request) {
        return issueService.create(request);
    }

    @PostMapping("/{id}/reply")
    public IssueView reply(@PathVariable Long id, @Valid @RequestBody IssueReplyRequest request) {
        return issueService.reply(id, request);
    }

    @PatchMapping("/{id}/status")
    public IssueView status(@PathVariable Long id, @Valid @RequestBody IssueStatusRequest request) {
        return issueService.changeStatus(id, request);
    }

    @PostMapping("/{id}/read")
    public IssueView read(@PathVariable Long id) {
        return issueService.markRead(id);
    }
}


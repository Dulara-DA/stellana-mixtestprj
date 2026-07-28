package com.stellana.mixing.api;

import com.stellana.mixing.api.ApiModels.*;
import com.stellana.mixing.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;

    @GetMapping
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public List<UserView> list() {
        return userService.list();
    }

    @GetMapping("/officers")
    @PreAuthorize("hasAnyRole('MANAGER','SYSTEM_ADMIN')")
    public List<UserView> officers() {
        return userService.activeOfficers();
    }

    @PostMapping
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public UserView create(@Valid @RequestBody CreateUserRequest request) {
        return userService.create(request);
    }

    @PatchMapping("/{id}/active")
    @PreAuthorize("hasRole('SYSTEM_ADMIN')")
    public UserView setActive(@PathVariable Long id, @Valid @RequestBody UserStatusRequest request) {
        return userService.setActive(id, request.active());
    }
}

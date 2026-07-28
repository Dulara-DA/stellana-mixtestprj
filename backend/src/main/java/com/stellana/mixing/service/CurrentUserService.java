package com.stellana.mixing.service;

import com.stellana.mixing.domain.UserAccount;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CurrentUserService {
    private final UserAccountRepository userAccountRepository;

    public UserAccount requireCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new NotFoundException("Authenticated user was not found.");
        }
        return userAccountRepository.findByEmailIgnoreCase(authentication.getName())
                .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));
    }
}


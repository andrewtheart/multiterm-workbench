/*
 * MultiTerm Workbench Explorer launcher
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

#include <windows.h>
#include <shellapi.h>
#include <string>
#include <vector>

namespace
{
std::wstring QuoteArgument(const std::wstring& value)
{
    std::wstring result = L"\"";
    unsigned int backslashes = 0;
    for (wchar_t character : value)
    {
        if (character == L'\\')
        {
            ++backslashes;
        }
        else if (character == L'\"')
        {
            result.append(backslashes * 2 + 1, L'\\');
            result.push_back(L'\"');
            backslashes = 0;
        }
        else
        {
            result.append(backslashes, L'\\');
            backslashes = 0;
            result.push_back(character);
        }
    }
    result.append(backslashes * 2, L'\\');
    result.push_back(L'\"');
    return result;
}

std::wstring ModuleDirectory()
{
    std::vector<wchar_t> buffer(32768);
    const DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (length == 0 || length >= buffer.size())
    {
        return std::wstring();
    }
    std::wstring path(buffer.data(), length);
    const size_t separator = path.find_last_of(L"\\/");
    return separator == std::wstring::npos ? std::wstring() : path.substr(0, separator);
}

std::wstring ParentDirectory(const std::wstring& path)
{
    const size_t separator = path.find_last_of(L"\\/");
    return separator == std::wstring::npos ? std::wstring() : path.substr(0, separator);
}
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int)
{
    int argumentCount = 0;
    LPWSTR* arguments = CommandLineToArgvW(GetCommandLineW(), &argumentCount);
    if (arguments == nullptr || argumentCount != 2)
    {
        if (arguments != nullptr) LocalFree(arguments);
        return 2;
    }

    const std::wstring folder = arguments[1];
    LocalFree(arguments);

    const DWORD attributes = GetFileAttributesW(folder.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0)
    {
        return 3;
    }

    const std::wstring architectureDirectory = ModuleDirectory();
    const std::wstring explorerDirectory = ParentDirectory(architectureDirectory);
    const std::wstring appDirectory = ParentDirectory(explorerDirectory);
    if (appDirectory.empty())
    {
        return 4;
    }

    wchar_t systemDirectory[MAX_PATH] = {};
    if (GetSystemDirectoryW(systemDirectory, MAX_PATH) == 0)
    {
        return 5;
    }

    const std::wstring powershell = std::wstring(systemDirectory)
        + L"\\WindowsPowerShell\\v1.0\\powershell.exe";
    const std::wstring script = appDirectory + L"\\Start-MultiTerm.ps1";
    std::wstring commandLine = QuoteArgument(powershell)
        + L" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass"
        + L" -WindowStyle Hidden -File " + QuoteArgument(script)
        + L" -OpenFolder " + QuoteArgument(folder);

    STARTUPINFOW startup = {};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process = {};
    std::vector<wchar_t> mutableCommand(commandLine.begin(), commandLine.end());
    mutableCommand.push_back(L'\0');

    const BOOL started = CreateProcessW(
        powershell.c_str(),
        mutableCommand.data(),
        nullptr,
        nullptr,
        FALSE,
        CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
        nullptr,
        appDirectory.c_str(),
        &startup,
        &process);
    if (!started)
    {
        return 6;
    }

    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return 0;
}

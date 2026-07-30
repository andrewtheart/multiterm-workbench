/*
 * MultiTerm Workbench Windows 11 Explorer command
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

#include <windows.h>
#include <shobjidl.h>
#include <shlguid.h>
#include <shlwapi.h>
#include <new>
#include <string>
#include <vector>

#pragma comment(lib, "shlwapi.lib")

// Must match the CLSID in the sparse-package manifests.
// {A8F59270-9897-46C6-AE03-5429BD656C4B}
const CLSID CLSID_MultiTermExplorerCommand =
{ 0xa8f59270, 0x9897, 0x46c6, { 0xae, 0x03, 0x54, 0x29, 0xbd, 0x65, 0x6c, 0x4b } };

namespace
{
long g_objectCount = 0;
long g_lockCount = 0;
HMODULE g_module = nullptr;

std::wstring ModuleDirectory()
{
    std::vector<wchar_t> buffer(32768);
    const DWORD length = GetModuleFileNameW(g_module, buffer.data(), static_cast<DWORD>(buffer.size()));
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

HRESULT FolderFromItem(IShellItem* item, std::wstring& folder)
{
    if (item == nullptr)
    {
        return E_INVALIDARG;
    }

    PWSTR path = nullptr;
    const HRESULT result = item->GetDisplayName(SIGDN_FILESYSPATH, &path);
    if (FAILED(result) || path == nullptr)
    {
        if (path != nullptr) CoTaskMemFree(path);
        return FAILED(result) ? result : E_INVALIDARG;
    }

    folder.assign(path);
    CoTaskMemFree(path);
    return PathIsDirectoryW(folder.c_str()) ? S_OK : E_INVALIDARG;
}

HRESULT FolderFromSite(IUnknown* site, std::wstring& folder)
{
    if (site == nullptr)
    {
        return E_INVALIDARG;
    }

    IServiceProvider* services = nullptr;
    HRESULT result = site->QueryInterface(IID_PPV_ARGS(&services));
    if (FAILED(result))
    {
        return result;
    }

    IFolderView* folderView = nullptr;
    result = services->QueryService(SID_SFolderView, IID_PPV_ARGS(&folderView));
    services->Release();
    if (FAILED(result))
    {
        return result;
    }

    IShellItem* item = nullptr;
    result = folderView->GetFolder(IID_PPV_ARGS(&item));
    folderView->Release();
    if (FAILED(result))
    {
        return result;
    }

    result = FolderFromItem(item, folder);
    item->Release();
    return result;
}

HRESULT FolderFromSelection(IShellItemArray* items, IUnknown* site, std::wstring& folder)
{
    if (items != nullptr)
    {
        DWORD count = 0;
        HRESULT result = items->GetCount(&count);
        if (FAILED(result))
        {
            return result;
        }
        if (count == 1)
        {
            IShellItem* item = nullptr;
            result = items->GetItemAt(0, &item);
            if (FAILED(result))
            {
                return result;
            }

            result = FolderFromItem(item, folder);
            item->Release();
            return result;
        }
        if (count > 1)
        {
            return E_INVALIDARG;
        }
    }

    return FolderFromSite(site, folder);
}

class ExplorerCommand final : public IExplorerCommand, public IObjectWithSite
{
public:
    ExplorerCommand() : references_(1), site_(nullptr)
    {
        InterlockedIncrement(&g_objectCount);
    }

    ~ExplorerCommand()
    {
        if (site_ != nullptr)
        {
            site_->Release();
        }
        InterlockedDecrement(&g_objectCount);
    }

    IFACEMETHODIMP QueryInterface(REFIID interfaceId, void** object) override
    {
        if (object == nullptr) return E_POINTER;
        *object = nullptr;
        if (interfaceId == IID_IUnknown || interfaceId == __uuidof(IExplorerCommand))
        {
            *object = static_cast<IExplorerCommand*>(this);
            AddRef();
            return S_OK;
        }
        if (interfaceId == IID_IObjectWithSite)
        {
            *object = static_cast<IObjectWithSite*>(this);
            AddRef();
            return S_OK;
        }
        return E_NOINTERFACE;
    }

    IFACEMETHODIMP_(ULONG) AddRef() override
    {
        return static_cast<ULONG>(InterlockedIncrement(&references_));
    }

    IFACEMETHODIMP_(ULONG) Release() override
    {
        const long references = InterlockedDecrement(&references_);
        if (references == 0) delete this;
        return static_cast<ULONG>(references);
    }

    IFACEMETHODIMP GetTitle(IShellItemArray*, PWSTR* title) override
    {
        return title == nullptr ? E_POINTER : SHStrDupW(L"Open in MultiTerm", title);
    }

    IFACEMETHODIMP GetIcon(IShellItemArray*, PWSTR* icon) override
    {
        if (icon == nullptr) return E_POINTER;
        const std::wstring appDirectory = ParentDirectory(ParentDirectory(ModuleDirectory()));
        if (appDirectory.empty())
        {
            *icon = nullptr;
            return E_NOTIMPL;
        }
        return SHStrDupW((appDirectory + L"\\MultiTerm.ico").c_str(), icon);
    }

    IFACEMETHODIMP GetToolTip(IShellItemArray*, PWSTR* tooltip) override
    {
        if (tooltip == nullptr) return E_POINTER;
        *tooltip = nullptr;
        return E_NOTIMPL;
    }

    IFACEMETHODIMP GetCanonicalName(GUID* canonicalName) override
    {
        if (canonicalName == nullptr) return E_POINTER;
        *canonicalName = CLSID_MultiTermExplorerCommand;
        return S_OK;
    }

    IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override
    {
        if (state == nullptr) return E_POINTER;
        std::wstring folder;
        *state = SUCCEEDED(FolderFromSelection(items, site_, folder)) ? ECS_ENABLED : ECS_HIDDEN;
        return S_OK;
    }

    IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override
    {
        std::wstring folder;
        HRESULT result = FolderFromSelection(items, site_, folder);
        if (FAILED(result)) return result;

        const std::wstring launcher = ModuleDirectory() + L"\\MultiTermLauncher.exe";
        std::wstring commandLine = QuoteArgument(launcher) + L" " + QuoteArgument(folder);
        std::vector<wchar_t> mutableCommand(commandLine.begin(), commandLine.end());
        mutableCommand.push_back(L'\0');

        STARTUPINFOW startup = {};
        startup.cb = sizeof(startup);
        PROCESS_INFORMATION process = {};
        if (!CreateProcessW(
            launcher.c_str(), mutableCommand.data(), nullptr, nullptr, FALSE,
            CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, nullptr,
            ModuleDirectory().c_str(), &startup, &process))
        {
            return HRESULT_FROM_WIN32(GetLastError());
        }

        CloseHandle(process.hThread);
        CloseHandle(process.hProcess);
        return S_OK;
    }

    IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override
    {
        if (flags == nullptr) return E_POINTER;
        *flags = ECF_DEFAULT;
        return S_OK;
    }

    IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** commands) override
    {
        if (commands == nullptr) return E_POINTER;
        *commands = nullptr;
        return E_NOTIMPL;
    }

    IFACEMETHODIMP SetSite(IUnknown* site) override
    {
        if (site != nullptr)
        {
            site->AddRef();
        }
        IUnknown* previous = site_;
        site_ = site;
        if (previous != nullptr)
        {
            previous->Release();
        }
        return S_OK;
    }

    IFACEMETHODIMP GetSite(REFIID interfaceId, void** site) override
    {
        if (site == nullptr) return E_POINTER;
        *site = nullptr;
        return site_ == nullptr ? E_FAIL : site_->QueryInterface(interfaceId, site);
    }

private:
    long references_;
    IUnknown* site_;
};

class CommandFactory final : public IClassFactory
{
public:
    CommandFactory() : references_(1)
    {
        InterlockedIncrement(&g_objectCount);
    }

    ~CommandFactory()
    {
        InterlockedDecrement(&g_objectCount);
    }

    IFACEMETHODIMP QueryInterface(REFIID interfaceId, void** object) override
    {
        if (object == nullptr) return E_POINTER;
        *object = nullptr;
        if (interfaceId == IID_IUnknown || interfaceId == IID_IClassFactory)
        {
            *object = static_cast<IClassFactory*>(this);
            AddRef();
            return S_OK;
        }
        return E_NOINTERFACE;
    }

    IFACEMETHODIMP_(ULONG) AddRef() override
    {
        return static_cast<ULONG>(InterlockedIncrement(&references_));
    }

    IFACEMETHODIMP_(ULONG) Release() override
    {
        const long references = InterlockedDecrement(&references_);
        if (references == 0) delete this;
        return static_cast<ULONG>(references);
    }

    IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID interfaceId, void** object) override
    {
        if (outer != nullptr) return CLASS_E_NOAGGREGATION;
        ExplorerCommand* command = new (std::nothrow) ExplorerCommand();
        if (command == nullptr) return E_OUTOFMEMORY;
        const HRESULT result = command->QueryInterface(interfaceId, object);
        command->Release();
        return result;
    }

    IFACEMETHODIMP LockServer(BOOL lock) override
    {
        if (lock) InterlockedIncrement(&g_lockCount);
        else InterlockedDecrement(&g_lockCount);
        return S_OK;
    }

private:
    long references_;
};
}

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID)
{
    if (reason == DLL_PROCESS_ATTACH)
    {
        g_module = module;
        DisableThreadLibraryCalls(module);
    }
    return TRUE;
}

extern "C" HRESULT __stdcall DllGetClassObject(REFCLSID classId, REFIID interfaceId, void** object)
{
    if (classId != CLSID_MultiTermExplorerCommand) return CLASS_E_CLASSNOTAVAILABLE;
    CommandFactory* factory = new (std::nothrow) CommandFactory();
    if (factory == nullptr) return E_OUTOFMEMORY;
    const HRESULT result = factory->QueryInterface(interfaceId, object);
    factory->Release();
    return result;
}

extern "C" HRESULT __stdcall DllCanUnloadNow()
{
    return g_objectCount == 0 && g_lockCount == 0 ? S_OK : S_FALSE;
}

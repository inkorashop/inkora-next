function Set-ExeIcon {
    param(
        [Parameter(Mandatory = $true)][string]$ExePath,
        [Parameter(Mandatory = $true)][string]$IconPath,
        [int]$GroupId = 3000
    )

    if (-not ("InkoraIconResourceUpdater" -as [type])) {
        Add-Type @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

public static class InkoraIconResourceUpdater
{
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cbData);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);

    private const int RT_ICON = 3;
    private const int RT_GROUP_ICON = 14;

    private struct IconEntry
    {
        public byte Width;
        public byte Height;
        public byte ColorCount;
        public byte Reserved;
        public ushort Planes;
        public ushort BitCount;
        public uint Size;
        public uint Offset;
        public ushort Id;
        public byte[] Data;
    }

    public static void SetIcon(string exePath, string iconPath, int groupId)
    {
        var entries = ReadIconEntries(iconPath);
        IntPtr handle = BeginUpdateResource(exePath, false);
        if (handle == IntPtr.Zero)
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }

        bool ok = false;
        try
        {
            foreach (var entry in entries)
            {
                if (!UpdateResource(handle, (IntPtr)RT_ICON, (IntPtr)entry.Id, 0, entry.Data, (uint)entry.Data.Length))
                {
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                }
            }

            byte[] groupData = BuildGroupIcon(entries);
            if (!UpdateResource(handle, (IntPtr)RT_GROUP_ICON, (IntPtr)groupId, 0, groupData, (uint)groupData.Length))
            {
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }

            ok = true;
        }
        finally
        {
            if (!EndUpdateResource(handle, !ok))
            {
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
        }
    }

    private static List<IconEntry> ReadIconEntries(string iconPath)
    {
        var entries = new List<IconEntry>();
        using (var stream = File.OpenRead(iconPath))
        using (var reader = new BinaryReader(stream))
        {
            ushort reserved = reader.ReadUInt16();
            ushort type = reader.ReadUInt16();
            ushort count = reader.ReadUInt16();
            if (reserved != 0 || type != 1 || count == 0)
            {
                throw new InvalidDataException("Invalid ICO file.");
            }

            for (int i = 0; i < count; i++)
            {
                entries.Add(new IconEntry
                {
                    Width = reader.ReadByte(),
                    Height = reader.ReadByte(),
                    ColorCount = reader.ReadByte(),
                    Reserved = reader.ReadByte(),
                    Planes = reader.ReadUInt16(),
                    BitCount = reader.ReadUInt16(),
                    Size = reader.ReadUInt32(),
                    Offset = reader.ReadUInt32(),
                    Id = (ushort)(i + 1)
                });
            }

            for (int i = 0; i < entries.Count; i++)
            {
                IconEntry entry = entries[i];
                stream.Position = entry.Offset;
                entry.Data = reader.ReadBytes((int)entry.Size);
                entries[i] = entry;
            }
        }
        return entries;
    }

    private static byte[] BuildGroupIcon(List<IconEntry> entries)
    {
        using (var stream = new MemoryStream())
        using (var writer = new BinaryWriter(stream))
        {
            writer.Write((ushort)0);
            writer.Write((ushort)1);
            writer.Write((ushort)entries.Count);
            foreach (var entry in entries)
            {
                writer.Write(entry.Width);
                writer.Write(entry.Height);
                writer.Write(entry.ColorCount);
                writer.Write(entry.Reserved);
                writer.Write(entry.Planes);
                writer.Write(entry.BitCount);
                writer.Write(entry.Size);
                writer.Write(entry.Id);
            }
            return stream.ToArray();
        }
    }
}
'@
    }

    [InkoraIconResourceUpdater]::SetIcon($ExePath, $IconPath, $GroupId)
}
